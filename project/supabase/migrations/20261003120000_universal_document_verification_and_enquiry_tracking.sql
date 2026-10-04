ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS tracking_code text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tracking_code text;

ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS tracking_code text;

ALTER TABLE public.project_investment_documents
  ADD COLUMN IF NOT EXISTS document_ref text,
  ADD COLUMN IF NOT EXISTS verification_code text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_tracking_code
  ON public.leads (tracking_code) WHERE tracking_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_investments_tracking_code
  ON public.investments (tracking_code) WHERE tracking_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_investment_documents_ref
  ON public.project_investment_documents (document_ref) WHERE document_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_investment_documents_verification
  ON public.project_investment_documents (verification_code) WHERE verification_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_verification_and_tracking_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'client_documents' OR TG_TABLE_NAME = 'project_investment_documents' THEN
    IF TG_OP = 'UPDATE' AND OLD.verification_code IS NOT NULL AND NEW.verification_code IS DISTINCT FROM OLD.verification_code THEN
      RAISE EXCEPTION 'Document verification codes are immutable' USING ERRCODE = '42501';
    END IF;
    IF coalesce(btrim(NEW.verification_code), '') = '' THEN
      NEW.verification_code := 'NBGV-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.generated_document_verification_seq')::text, 10, '0');
    ELSE
      NEW.verification_code := upper(btrim(NEW.verification_code));
    END IF;
    IF coalesce(btrim(NEW.document_ref), '') = '' THEN
      NEW.document_ref := 'NBG-DOC-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || upper(replace(gen_random_uuid()::text, '-', ''));
    END IF;
    NEW.generated_at := coalesce(NEW.generated_at, now());
  ELSIF TG_TABLE_NAME = 'leads' THEN
    IF TG_OP = 'UPDATE' AND OLD.tracking_code IS NOT NULL AND NEW.tracking_code IS DISTINCT FROM OLD.tracking_code THEN
      RAISE EXCEPTION 'Enquiry tracking codes are immutable' USING ERRCODE = '42501';
    END IF;
    IF coalesce(btrim(NEW.tracking_code), '') = '' THEN
      NEW.tracking_code := 'NBGL-' || upper(replace(gen_random_uuid()::text, '-', ''));
    END IF;
  ELSIF TG_TABLE_NAME = 'investments' THEN
    IF TG_OP = 'UPDATE' AND OLD.tracking_code IS NOT NULL AND NEW.tracking_code IS DISTINCT FROM OLD.tracking_code THEN
      RAISE EXCEPTION 'Enquiry tracking codes are immutable' USING ERRCODE = '42501';
    END IF;
    IF coalesce(btrim(NEW.tracking_code), '') = '' THEN
      NEW.tracking_code := 'NBGI-' || upper(replace(gen_random_uuid()::text, '-', ''));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_client_document_verification ON public.client_documents;
CREATE TRIGGER assign_client_document_verification
  BEFORE INSERT OR UPDATE OF verification_code, document_ref, generated_at, source_type ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.assign_verification_and_tracking_codes();

DROP TRIGGER IF EXISTS assign_investment_document_verification ON public.project_investment_documents;
CREATE TRIGGER assign_investment_document_verification
  BEFORE INSERT OR UPDATE OF verification_code, document_ref, generated_at ON public.project_investment_documents
  FOR EACH ROW EXECUTE FUNCTION public.assign_verification_and_tracking_codes();

DROP TRIGGER IF EXISTS assign_lead_tracking_code ON public.leads;
CREATE TRIGGER assign_lead_tracking_code
  BEFORE INSERT OR UPDATE OF tracking_code ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.assign_verification_and_tracking_codes();

DROP TRIGGER IF EXISTS assign_investment_tracking_code ON public.investments;
CREATE TRIGGER assign_investment_tracking_code
  BEFORE INSERT OR UPDATE OF tracking_code ON public.investments
  FOR EACH ROW EXECUTE FUNCTION public.assign_verification_and_tracking_codes();

UPDATE public.client_documents SET verification_code = verification_code WHERE verification_code IS NULL OR document_ref IS NULL OR generated_at IS NULL;
UPDATE public.project_investment_documents SET verification_code = verification_code WHERE verification_code IS NULL OR document_ref IS NULL OR generated_at IS NULL;
UPDATE public.leads
SET tracking_code = substring(message FROM 'Reference: (NBG-[A-Z0-9-]+)')
WHERE tracking_code IS NULL AND message ~ 'Reference: NBG-[A-Z0-9-]+';
UPDATE public.leads SET tracking_code = tracking_code WHERE tracking_code IS NULL;
UPDATE public.investments SET tracking_code = reference_code WHERE tracking_code IS NULL;

CREATE OR REPLACE FUNCTION public.verify_client_document(code text)
RETURNS TABLE (
  title text,
  category text,
  document_ref text,
  verification_code text,
  content_hash text,
  generated_at timestamptz,
  document_type text,
  document_status text,
  approval_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.title, d.category, d.document_ref, d.verification_code, d.content_hash, d.generated_at,
    coalesce(d.document_type, d.category), d.status, d.approval_status
  FROM public.client_documents AS d
  WHERE upper(btrim(d.verification_code)) = upper(btrim(code))
     OR upper(btrim(d.document_ref)) = upper(btrim(code))
  UNION ALL
  SELECT p.title, p.category, p.document_ref, p.verification_code, p.content_hash, p.generated_at,
    p.category, CASE WHEN p.is_published THEN 'PUBLISHED' ELSE 'DRAFT' END,
    CASE WHEN p.is_published THEN 'APPROVED' ELSE 'PENDING' END
  FROM public.project_investment_documents AS p
  WHERE upper(btrim(p.verification_code)) = upper(btrim(code))
     OR upper(btrim(p.document_ref)) = upper(btrim(code))
  UNION ALL
  SELECT e.title, e.category, e.document_ref, e.verification_code, e.content_hash, e.generated_at,
    e.category, 'VERIFIED_EXPORT'::text, 'NOT_REQUIRED'::text
  FROM public.verified_exports AS e
  WHERE upper(btrim(e.verification_code)) = upper(btrim(code))
     OR upper(btrim(e.document_ref)) = upper(btrim(code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_client_document(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_client_document(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_public_lead_enquiry(
  p_name text,
  p_phone text,
  p_email text,
  p_source text,
  p_project text,
  p_message text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_name text := btrim(coalesce(p_name, ''));
  clean_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  clean_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  created_tracking_code text;
BEGIN
  IF length(clean_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Name must be between 2 and 160 characters' USING ERRCODE = '22023';
  END IF;
  IF clean_email IS NULL AND clean_phone IS NULL THEN
    RAISE EXCEPTION 'A valid email address or phone number is required' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(clean_email, '')) > 254 OR length(coalesce(clean_phone, '')) > 40
    OR length(coalesce(p_message, '')) > 4000 THEN
    RAISE EXCEPTION 'One or more enquiry fields exceed the permitted length' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('contact-form', 'private-viewing') THEN
    RAISE EXCEPTION 'Unsupported enquiry type' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.leads (name, phone, email, project, source, message, status)
  VALUES (clean_name, clean_phone, clean_email, nullif(btrim(coalesce(p_project, '')), ''), p_source, nullif(btrim(coalesce(p_message, '')), ''), 'NEW')
  RETURNING tracking_code INTO created_tracking_code;
  RETURN created_tracking_code;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_lead_enquiry(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_lead_enquiry(text, text, text, text, text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.track_public_enquiry(text);
CREATE FUNCTION public.track_public_enquiry(code text)
RETURNS TABLE (
  tracking_code text,
  request_type text,
  status text,
  submitted_at timestamptz,
  project_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.tracking_code,
    CASE WHEN l.source = 'private-viewing' THEN 'PRIVATE_VIEWING' ELSE 'CONTACT_ENQUIRY' END,
    l.status,
    l.created_at,
    l.project
  FROM public.leads AS l
  WHERE upper(l.tracking_code) = upper(btrim(code))
  UNION ALL
  SELECT i.tracking_code, 'INVESTMENT_ENQUIRY', i.status, i.created_at, p.name
  FROM public.investments AS i
  LEFT JOIN public.projects AS p ON p.id = i.project_id
  WHERE upper(i.tracking_code) = upper(btrim(code)) OR upper(i.reference_code) = upper(btrim(code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.track_public_enquiry(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_public_enquiry(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_public_investment_enquiry(
  p_project_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_range text,
  p_structure text,
  p_message text,
  p_consent boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_tracking_code text;
  account_id uuid;
  clean_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  clean_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  clean_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF p_consent IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Consent to contact is required' USING ERRCODE = '22023';
  END IF;
  IF length(clean_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Name must be between 2 and 160 characters' USING ERRCODE = '22023';
  END IF;
  IF clean_email IS NULL AND clean_phone IS NULL THEN
    RAISE EXCEPTION 'A valid email address or phone number is required' USING ERRCODE = '22023';
  END IF;
  IF clean_email IS NOT NULL AND (length(clean_email) > 254 OR clean_email !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$') THEN
    RAISE EXCEPTION 'A valid email address is required' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(clean_phone, '')) > 40
    OR length(coalesce(p_range, '')) > 80
    OR length(coalesce(p_structure, '')) > 100
    OR length(coalesce(p_message, '')) > 2000 THEN
    RAISE EXCEPTION 'One or more enquiry fields exceed the permitted length' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND is_published = true) THEN
    RAISE EXCEPTION 'This project is not available for enquiries' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO account_id
  FROM public.profiles
  WHERE id = auth.uid() AND role = 'client';

  INSERT INTO public.investments (
    investor_name, investor_email, investor_phone, project_id,
    investment_range, investment_structure, investor_message,
    consent_to_contact, consent_at, investor_user_id, status, currency
  ) VALUES (
    clean_name, clean_email, clean_phone, p_project_id,
    nullif(btrim(coalesce(p_range, '')), ''),
    nullif(btrim(coalesce(p_structure, '')), ''),
    nullif(btrim(coalesce(p_message, '')), ''),
    true, now(), account_id, 'INQUIRY', 'KES'
  ) RETURNING tracking_code INTO created_tracking_code;

  RETURN created_tracking_code;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_investment_enquiry(uuid, text, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_investment_enquiry(uuid, text, text, text, text, text, text, boolean) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
