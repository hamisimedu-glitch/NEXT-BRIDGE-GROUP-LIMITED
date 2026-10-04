-- Prevent edits or deletions to restricted unit financial records after their first save.
CREATE OR REPLACE FUNCTION public.guard_restricted_financial_record_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Restricted financial records are immutable once saved for audit integrity.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS restricted_financial_record_immutability_guard ON public.unit_financials;
CREATE TRIGGER restricted_financial_record_immutability_guard
  BEFORE UPDATE OR DELETE ON public.unit_financials
  FOR EACH ROW EXECUTE FUNCTION public.guard_restricted_financial_record_immutability();

REVOKE ALL ON FUNCTION public.guard_restricted_financial_record_immutability() FROM PUBLIC, anon, authenticated;
