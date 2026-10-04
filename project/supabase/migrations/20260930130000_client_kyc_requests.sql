CREATE TABLE IF NOT EXISTS public.client_kyc_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_fields text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED')),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_kyc_requests_pending_user
  ON public.client_kyc_requests(user_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_client_kyc_requests_user_date
  ON public.client_kyc_requests(user_id, requested_at DESC);

ALTER TABLE public.client_kyc_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_kyc_requests_staff_read" ON public.client_kyc_requests;
CREATE POLICY "client_kyc_requests_staff_read" ON public.client_kyc_requests
  FOR SELECT TO authenticated USING (public.is_dashboard_staff());

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
    CASE WHEN nullif(btrim(profile_row.identity_document_type), '') IS NULL THEN 'identity document type' END,
    CASE WHEN nullif(btrim(profile_row.identity_document_number), '') IS NULL THEN 'ID / passport number' END,
    CASE WHEN nullif(btrim(profile_row.residential_address), '') IS NULL THEN 'residential address' END
  ], NULL);
  IF cardinality(missing_fields) = 0 THEN
    RAISE EXCEPTION 'Client KYC details are already complete' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.client_kyc_requests (user_id, requested_fields, requested_by, requested_at)
  VALUES (p_user_id, missing_fields, auth.uid(), now())
  ON CONFLICT (user_id) WHERE status = 'PENDING'
  DO UPDATE SET requested_fields = EXCLUDED.requested_fields,
                requested_by = EXCLUDED.requested_by,
                requested_at = EXCLUDED.requested_at
  RETURNING * INTO request_row;

  INSERT INTO public.client_notifications (user_id, title, body, kind)
  VALUES (
    p_user_id,
    'Action required: complete your KYC details',
    'Please update your profile with: ' || array_to_string(missing_fields, ', ') || '. This information is required to prepare your legal documents. Open Profile & security and save your updated details.',
    'KYC_UPDATE_REQUEST'
  );

  RETURN request_row;
END;
$$;

REVOKE ALL ON FUNCTION public.request_client_kyc_update(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_client_kyc_update(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_client_kyc_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF nullif(btrim(NEW.identity_document_type), '') IS NOT NULL
    AND nullif(btrim(NEW.identity_document_number), '') IS NOT NULL
    AND nullif(btrim(NEW.residential_address), '') IS NOT NULL THEN
    UPDATE public.client_kyc_requests
    SET status = 'COMPLETED', completed_at = now()
    WHERE user_id = NEW.id AND status = 'PENDING';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complete_client_kyc_requests ON public.profiles;
CREATE TRIGGER complete_client_kyc_requests
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.complete_client_kyc_requests();
