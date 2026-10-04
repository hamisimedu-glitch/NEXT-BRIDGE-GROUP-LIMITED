ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS identity_document_type text,
  ADD COLUMN IF NOT EXISTS identity_document_number text,
  ADD COLUMN IF NOT EXISTS residential_address text;

INSERT INTO public.document_number_sequences (document_type, prefix)
VALUES ('CLIENT_INVOICE', 'NBG-CI')
ON CONFLICT (document_type) DO NOTHING;

GRANT UPDATE (identity_document_type, identity_document_number, residential_address)
  ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.list_document_client_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  phone text,
  email text,
  identity_document_type text,
  identity_document_number text,
  residential_address text,
  preferred_location text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_dashboard_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.phone, u.email::text,
         p.identity_document_type, p.identity_document_number,
         p.residential_address, p.preferred_location
  FROM public.profiles AS p
  LEFT JOIN auth.users AS u ON u.id = p.id
  WHERE p.role = 'client'
  ORDER BY p.full_name NULLS LAST, u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_document_client_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_document_client_profiles() TO authenticated;