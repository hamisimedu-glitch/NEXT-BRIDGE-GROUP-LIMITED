CREATE SEQUENCE IF NOT EXISTS public.business_reference_seq;

CREATE OR REPLACE FUNCTION public.next_business_reference(p_prefix text)
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'NBG-' || left(regexp_replace(upper(coalesce(p_prefix, 'REF')), '[^A-Z0-9]', '', 'g'), 4)
    || '-' || to_char(clock_timestamp(), 'YYYYMMDD')
    || '-' || lpad(nextval('public.business_reference_seq')::text, 8, '0');
$$;
REVOKE ALL ON FUNCTION public.next_business_reference(text) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS reference_code text;
UPDATE public.investments
SET reference_code = public.next_business_reference('ENQ')
WHERE reference_code IS NULL;
ALTER TABLE public.investments
  ALTER COLUMN reference_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_investments_reference_code
  ON public.investments (reference_code);

ALTER TABLE public.investment_transactions
  ADD COLUMN IF NOT EXISTS transaction_ref text;
UPDATE public.investment_transactions
SET transaction_ref = public.next_business_reference('TXN')
WHERE transaction_ref IS NULL;
ALTER TABLE public.investment_transactions
  ALTER COLUMN transaction_ref SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_investment_transactions_transaction_ref
  ON public.investment_transactions (transaction_ref);

CREATE OR REPLACE FUNCTION public.assign_immutable_business_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'investments' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.reference_code := public.next_business_reference('ENQ');
    ELSIF NEW.reference_code IS DISTINCT FROM OLD.reference_code THEN
      RAISE EXCEPTION 'Investment reference codes are immutable' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'investment_transactions' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.transaction_ref := public.next_business_reference('TXN');
    ELSIF NEW.transaction_ref IS DISTINCT FROM OLD.transaction_ref THEN
      RAISE EXCEPTION 'Transaction reference codes are immutable' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_investment_reference ON public.investments;
CREATE TRIGGER assign_investment_reference
  BEFORE INSERT OR UPDATE OF reference_code ON public.investments
  FOR EACH ROW EXECUTE FUNCTION public.assign_immutable_business_reference();
DROP TRIGGER IF EXISTS assign_investment_transaction_reference ON public.investment_transactions;
CREATE TRIGGER assign_investment_transaction_reference
  BEFORE INSERT OR UPDATE OF transaction_ref ON public.investment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.assign_immutable_business_reference();

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
  created_reference text;
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
  ) RETURNING reference_code INTO created_reference;

  RETURN created_reference;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_investment_enquiry(uuid, text, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_investment_enquiry(uuid, text, text, text, text, text, text, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_client_access_accounts()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  phone text,
  email text,
  role text,
  preferred_location text,
  investment_budget text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  access_status text,
  investment_count bigint,
  restricted_document_count bigint,
  last_investment_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_dashboard_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.phone,
    u.email::text,
    p.role,
    p.preferred_location,
    p.investment_budget,
    u.created_at,
    u.email_confirmed_at,
    u.last_sign_in_at,
    CASE
      WHEN u.banned_until > now() THEN 'SUSPENDED'
      WHEN u.email_confirmed_at IS NULL THEN 'UNCONFIRMED'
      WHEN u.last_sign_in_at IS NULL THEN 'NEVER_SIGNED_IN'
      ELSE 'ACTIVE'
    END,
    coalesce(investment_totals.record_count, 0),
    coalesce(document_totals.record_count, 0),
    investment_totals.last_activity
  FROM public.profiles AS p
  JOIN auth.users AS u ON u.id = p.id
  LEFT JOIN LATERAL (
    SELECT count(*) AS record_count, max(i.created_at) AS last_activity
    FROM public.investments AS i
    WHERE i.investor_user_id = p.id
  ) AS investment_totals ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS record_count
    FROM public.project_investment_documents AS d
    WHERE d.investor_user_id = p.id AND d.is_published = true
  ) AS document_totals ON true
  WHERE p.role = 'client'
  ORDER BY p.full_name NULLS LAST, u.email;
END;
$$;

REVOKE ALL ON FUNCTION public.list_client_access_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_client_access_accounts() TO authenticated;
