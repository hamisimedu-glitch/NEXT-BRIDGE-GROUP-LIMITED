CREATE SEQUENCE IF NOT EXISTS public.generated_document_verification_seq;

CREATE OR REPLACE FUNCTION public.next_document_verification_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_dashboard_staff() THEN
    RAISE EXCEPTION 'Staff access required to issue document verification codes' USING ERRCODE = '42501';
  END IF;
  RETURN 'NBGV-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.generated_document_verification_seq')::text, 10, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_document_verification_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_document_verification_code() TO authenticated;

UPDATE public.client_documents
SET verification_code = 'NBGV-' || to_char(coalesce(generated_at, created_at, now()), 'YYYYMMDD') || '-LEGACY-' || upper(substr(md5(id::text), 1, 12)),
    generated_at = coalesce(generated_at, created_at, now())
WHERE source_type = 'GENERATED'
  AND verification_code IS NULL;

CREATE OR REPLACE FUNCTION public.guard_generated_document_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.source_type = 'GENERATED'
    AND NEW.source_type IS DISTINCT FROM OLD.source_type THEN
    RAISE EXCEPTION 'Generated document records cannot be reclassified' USING ERRCODE = '42501';
  END IF;

  IF NEW.source_type = 'GENERATED' THEN
    IF coalesce(btrim(NEW.verification_code), '') = '' THEN
      RAISE EXCEPTION 'A generated document must have a verification code' USING ERRCODE = '22023';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.source_type = 'GENERATED'
      AND NEW.verification_code IS DISTINCT FROM OLD.verification_code THEN
      RAISE EXCEPTION 'Generated document verification codes are immutable' USING ERRCODE = '42501';
    END IF;
    NEW.verification_code := upper(btrim(NEW.verification_code));
    NEW.generated_at := coalesce(NEW.generated_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_generated_document_verification ON public.client_documents;
CREATE TRIGGER guard_generated_document_verification
  BEFORE INSERT OR UPDATE OF verification_code, source_type ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_generated_document_verification();

DROP FUNCTION IF EXISTS public.verify_client_document(text);
CREATE FUNCTION public.verify_client_document(code text)
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
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_client_document(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_client_document(text) TO anon, authenticated;
