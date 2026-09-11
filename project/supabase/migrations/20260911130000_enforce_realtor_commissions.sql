/*
# Enforce realtor commissions

Linked commissions always use 5% of the related sale price. This keeps imports,
admin actions, and future integrations consistent with the commission policy.
*/

CREATE OR REPLACE FUNCTION public.normalize_realtor_commission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  linked_sale_price numeric;
BEGIN
  NEW.rate := 5.00;
  IF NEW.sale_id IS NOT NULL THEN
    SELECT sale_price INTO linked_sale_price FROM public.sales WHERE id = NEW.sale_id;
    IF linked_sale_price IS NOT NULL THEN
      NEW.amount := round(linked_sale_price * 0.05, 2);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_realtor_commission_before_write ON public.commissions;
CREATE TRIGGER normalize_realtor_commission_before_write
  BEFORE INSERT OR UPDATE ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.normalize_realtor_commission();
