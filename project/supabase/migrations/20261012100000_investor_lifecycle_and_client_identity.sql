ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE OR REPLACE FUNCTION public.guard_investment_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_dashboard_admin() THEN
    IF NEW.amount_committed IS DISTINCT FROM OLD.amount_committed THEN
      RAISE EXCEPTION 'Admin access required to update committed amounts' USING ERRCODE = '42501';
    END IF;
    IF NEW.investor_user_id IS DISTINCT FROM OLD.investor_user_id
      AND NOT (
        OLD.investor_user_id IS NULL
        AND NEW.investor_user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM auth.users AS account
          WHERE account.id = auth.uid()
            AND account.email_confirmed_at IS NOT NULL
            AND lower(account.email) = lower(OLD.investor_email)
        )
      ) THEN
      RAISE EXCEPTION 'Only an administrator or the verified enquiry owner may link this investor account' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.investment_application_has_basis(application public.investments)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT nullif(btrim(application.investor_name), '') IS NOT NULL
    AND (nullif(btrim(application.investor_email), '') IS NOT NULL OR nullif(btrim(application.investor_phone), '') IS NOT NULL)
    AND application.consent_to_contact IS TRUE
    AND (application.project_id IS NOT NULL OR nullif(btrim(application.investment_structure), '') IS NOT NULL)
    AND (
      nullif(btrim(application.investment_range), '') IS NOT NULL
      OR coalesce(application.amount_interested, 0) > 0
      OR nullif(btrim(application.investor_message), '') IS NOT NULL
    );
$$;
REVOKE ALL ON FUNCTION public.investment_application_has_basis(public.investments) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.investment_application_has_basis(public.investments) TO authenticated;

CREATE TABLE IF NOT EXISTS public.investment_application_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id uuid NOT NULL REFERENCES public.investments(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  decision_notes text NOT NULL,
  amount_committed numeric(14,2),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investment_application_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS investment_application_reviews_staff_read ON public.investment_application_reviews;
CREATE POLICY investment_application_reviews_staff_read ON public.investment_application_reviews
  FOR SELECT TO authenticated USING (public.is_dashboard_staff());
GRANT SELECT ON public.investment_application_reviews TO authenticated;

DROP TRIGGER IF EXISTS audit_investment_application_reviews ON public.investment_application_reviews;
CREATE TRIGGER audit_investment_application_reviews
  AFTER INSERT OR UPDATE OR DELETE ON public.investment_application_reviews
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_change();

CREATE OR REPLACE FUNCTION public.guard_investment_application_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
    AND current_setting('nbg.investment_status_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Use the guided investor review action to change application status' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_investment_application_lifecycle ON public.investments;
CREATE TRIGGER guard_investment_application_lifecycle
  BEFORE UPDATE OF status ON public.investments
  FOR EACH ROW EXECUTE FUNCTION public.guard_investment_application_lifecycle();

CREATE OR REPLACE FUNCTION public.advance_investment_application(
  p_investment_id uuid,
  p_status text,
  p_amount_committed numeric,
  p_decision_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  application public.investments%ROWTYPE;
  clean_notes text := btrim(coalesce(p_decision_notes, ''));
BEGIN
  IF NOT public.is_dashboard_staff() THEN
    RAISE EXCEPTION 'Staff access required to review investor applications' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO application FROM public.investments WHERE id = p_investment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Investor application not found' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('SOFT_COMMIT', 'COMMITTED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'Select a valid investor review stage' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'SOFT_COMMIT' THEN
    IF application.status <> 'INQUIRY' THEN
      RAISE EXCEPTION 'Only a pending application can enter review' USING ERRCODE = '22023';
    END IF;
    IF NOT public.investment_application_has_basis(application) THEN
      RAISE EXCEPTION 'Complete the investor name, contact, consent, project or structure, and investment details before review' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('nbg.investment_status_rpc', 'on', true);
    UPDATE public.investments
    SET status = 'SOFT_COMMIT', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_investment_id;
  ELSIF p_status = 'COMMITTED' THEN
    IF application.status <> 'SOFT_COMMIT' THEN
      RAISE EXCEPTION 'Move the application to In review before committing it' USING ERRCODE = '22023';
    END IF;
    IF NOT public.is_dashboard_admin() THEN
      RAISE EXCEPTION 'Admin access is required to commit an investment' USING ERRCODE = '42501';
    END IF;
    IF NOT public.investment_application_has_basis(application)
      OR coalesce(p_amount_committed, 0) <= 0
      OR length(clean_notes) < 12 THEN
      RAISE EXCEPTION 'Record a committed amount and at least 12 characters of review notes before committing' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('nbg.investment_status_rpc', 'on', true);
    UPDATE public.investments SET status = 'COMMITTED', amount_committed = p_amount_committed WHERE id = p_investment_id;
  ELSE
    IF application.status <> 'SOFT_COMMIT' THEN
      RAISE EXCEPTION 'Move the application to In review before withdrawing it' USING ERRCODE = '22023';
    END IF;
    IF length(clean_notes) < 12 THEN
      RAISE EXCEPTION 'Record a withdrawal reason of at least 12 characters' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('nbg.investment_status_rpc', 'on', true);
    UPDATE public.investments SET status = 'WITHDRAWN' WHERE id = p_investment_id;
  END IF;

  INSERT INTO public.investment_application_reviews (investment_id, from_status, to_status, decision_notes, amount_committed, actor_id, actor_email)
  VALUES (p_investment_id, application.status, p_status, clean_notes, CASE WHEN p_status = 'COMMITTED' THEN p_amount_committed END, auth.uid(), auth.jwt() ->> 'email');
END;
$$;
REVOKE ALL ON FUNCTION public.advance_investment_application(uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_investment_application(uuid, text, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.link_my_investor_enquiries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_email text;
  linked_count integer;
BEGIN
  SELECT lower(account.email) INTO account_email
  FROM auth.users AS account
  JOIN public.profiles AS profile ON profile.id = account.id AND profile.role = 'client'
  WHERE account.id = auth.uid() AND account.email_confirmed_at IS NOT NULL;
  IF account_email IS NULL THEN
    RAISE EXCEPTION 'Confirm your email before linking investor enquiries' USING ERRCODE = '42501';
  END IF;

  UPDATE public.investments
  SET investor_user_id = auth.uid()
  WHERE investor_user_id IS NULL
    AND consent_to_contact IS TRUE
    AND lower(investor_email) = account_email;
  GET DIAGNOSTICS linked_count = ROW_COUNT;
  RETURN linked_count;
END;
$$;
REVOKE ALL ON FUNCTION public.link_my_investor_enquiries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_my_investor_enquiries() TO authenticated;

DROP POLICY IF EXISTS investor_read_own_transactions ON public.investment_transactions;
CREATE POLICY investor_read_own_transactions ON public.investment_transactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.investments AS investment
    WHERE investment.id = investment_id AND investment.investor_user_id = auth.uid()
  ));
GRANT SELECT ON public.investment_transactions TO authenticated;

DROP POLICY IF EXISTS client_identity_documents_upload ON storage.objects;
CREATE POLICY client_identity_documents_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND split_part(name, '/', 1) = 'client-kyc'
    AND split_part(name, '/', 2) = auth.uid()::text
    AND lower(name) ~ '[.](jpg|jpeg|png|webp|pdf)$'
  );

DROP POLICY IF EXISTS client_identity_documents_delete ON storage.objects;
CREATE POLICY client_identity_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND split_part(name, '/', 1) = 'client-kyc'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

DROP POLICY IF EXISTS client_identity_documents_insert_own ON public.client_documents;
CREATE POLICY client_identity_documents_insert_own ON public.client_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_global IS FALSE
    AND category = 'IDENTITY_DOCUMENT'
    AND source_type = 'CLIENT_UPLOAD'
    AND file_url LIKE 'client-kyc/' || auth.uid()::text || '/%'
  );

CREATE OR REPLACE FUNCTION public.refresh_client_kyc_request_status(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles AS profile
    WHERE profile.id = p_user_id
      AND nullif(btrim(profile.full_name), '') IS NOT NULL
      AND nullif(btrim(profile.identity_document_type), '') IS NOT NULL
      AND nullif(btrim(profile.identity_document_number), '') IS NOT NULL
      AND nullif(btrim(profile.residential_address), '') IS NOT NULL
  ) AND EXISTS (
    SELECT 1 FROM public.client_documents AS document
    WHERE document.user_id = p_user_id AND document.category = 'IDENTITY_DOCUMENT'
  ) THEN
    UPDATE public.client_kyc_requests
    SET status = 'COMPLETED', completed_at = now()
    WHERE user_id = p_user_id AND status = 'PENDING';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_client_kyc_request_status(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_client_kyc_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_client_kyc_request_status(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_client_kyc_document_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_client_kyc_request_status(CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS complete_client_kyc_document_requests ON public.client_documents;
CREATE TRIGGER complete_client_kyc_document_requests
  AFTER INSERT OR DELETE ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.complete_client_kyc_document_requests();

CREATE OR REPLACE FUNCTION public.request_client_kyc_update(p_user_id uuid)
RETURNS public.client_kyc_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.profiles%ROWTYPE;
  missing_fields text[];
  request_row public.client_kyc_requests%ROWTYPE;
BEGIN
  IF NOT public.is_dashboard_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO profile_row FROM public.profiles WHERE id = p_user_id AND role = 'client';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client profile not found' USING ERRCODE = '22023';
  END IF;

  missing_fields := array_remove(ARRAY[
    CASE WHEN nullif(btrim(profile_row.full_name), '') IS NULL THEN 'full legal name exactly as shown on identity document' END,
    CASE WHEN nullif(btrim(profile_row.identity_document_type), '') IS NULL THEN 'identity document type' END,
    CASE WHEN nullif(btrim(profile_row.identity_document_number), '') IS NULL THEN 'ID / passport number' END,
    CASE WHEN nullif(btrim(profile_row.residential_address), '') IS NULL THEN 'residential address' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.client_documents AS document WHERE document.user_id = p_user_id AND document.category = 'IDENTITY_DOCUMENT') THEN 'identity document upload' END
  ], NULL);
  IF cardinality(missing_fields) = 0 THEN
    RAISE EXCEPTION 'Client KYC details and identity document are already complete' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.client_kyc_requests (user_id, requested_fields, requested_by, requested_at)
  VALUES (p_user_id, missing_fields, auth.uid(), now())
  ON CONFLICT (user_id) WHERE status = 'PENDING'
  DO UPDATE SET requested_fields = EXCLUDED.requested_fields,
                requested_by = EXCLUDED.requested_by,
                requested_at = EXCLUDED.requested_at
  RETURNING * INTO request_row;

  INSERT INTO public.client_notifications (user_id, title, body, kind, action_url)
  VALUES (
    p_user_id,
    'Action required: complete your KYC details',
    'Please update your profile with: ' || array_to_string(missing_fields, ', ') || '. Enter your full legal name exactly as printed on your identity document and upload a clear image or PDF in Profile & security.',
    'KYC_UPDATE_REQUEST',
    '/portal?section=profile'
  );
  RETURN request_row;
END;
$$;

REVOKE ALL ON FUNCTION public.request_client_kyc_update(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_client_kyc_update(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';