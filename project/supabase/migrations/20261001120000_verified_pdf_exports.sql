CREATE TABLE IF NOT EXISTS public.verified_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_code text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  document_ref text NOT NULL UNIQUE,
  content_hash text NOT NULL,
  generated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.verified_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verified_exports FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.export_code_reservations (
  verification_code text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes'
);
ALTER TABLE public.export_code_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.export_code_reservations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reserve_export_verification_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  reserved_code := 'NBGV-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.generated_document_verification_seq')::text, 10, '0');
  INSERT INTO public.export_code_reservations (verification_code, user_id)
  VALUES (reserved_code, auth.uid());
  RETURN reserved_code;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_export_verification_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_export_verification_code() TO authenticated;

CREATE OR REPLACE FUNCTION public.register_export_verification(
  p_verification_code text,
  p_title text,
  p_category text,
  p_document_ref text,
  p_content_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_is_staff boolean := public.is_dashboard_staff();
  reserved_user uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT caller_is_staff AND p_category <> 'CLIENT_PAYMENT_STATEMENT' THEN
    RAISE EXCEPTION 'Staff access required to register this export' USING ERRCODE = '42501';
  END IF;
  IF NOT caller_is_staff AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'client'
  ) THEN
    RAISE EXCEPTION 'Client account required' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_verification_code), '') = ''
    OR coalesce(btrim(p_title), '') = ''
    OR coalesce(btrim(p_document_ref), '') = ''
    OR coalesce(btrim(p_content_hash), '') = '' THEN
    RAISE EXCEPTION 'Verification metadata is incomplete' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.export_code_reservations
  WHERE verification_code = upper(btrim(p_verification_code))
    AND user_id = auth.uid()
    AND expires_at > now()
  RETURNING user_id INTO reserved_user;
  IF reserved_user IS NULL THEN
    RAISE EXCEPTION 'Verification code was not reserved by this account or has expired' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.verified_exports (verification_code, title, category, document_ref, content_hash, generated_by)
  VALUES (upper(btrim(p_verification_code)), btrim(p_title), upper(btrim(p_category)), upper(btrim(p_document_ref)), lower(btrim(p_content_hash)), auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.register_export_verification(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_export_verification(text, text, text, text, text) TO authenticated;

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
  SELECT
    'NBG registered document'::text,
    d.category,
    d.document_ref,
    d.verification_code,
    d.content_hash,
    d.generated_at,
    coalesce(d.document_type, d.category),
    d.status,
    d.approval_status
  FROM public.client_documents AS d
  WHERE d.source_type = 'GENERATED'
    AND upper(btrim(d.verification_code)) = upper(btrim(code))
  UNION ALL
  SELECT
    e.title,
    e.category,
    e.document_ref,
    e.verification_code,
    e.content_hash,
    e.generated_at,
    e.category,
    'VERIFIED_EXPORT'::text,
    'NOT_REQUIRED'::text
  FROM public.verified_exports AS e
  WHERE upper(btrim(e.verification_code)) = upper(btrim(code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_client_document(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_client_document(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
