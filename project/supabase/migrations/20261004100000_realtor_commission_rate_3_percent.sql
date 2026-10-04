ALTER TABLE public.realtors
  ALTER COLUMN commission_rate SET DEFAULT 3.00;

UPDATE public.realtors
SET commission_rate = 3.00
WHERE commission_rate IS DISTINCT FROM 3.00;

CREATE OR REPLACE FUNCTION public.normalize_realtor_commission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  linked_sale_price numeric;
BEGIN
  NEW.rate := 3.00;
  IF NEW.sale_id IS NOT NULL THEN
    SELECT sale_price INTO linked_sale_price
    FROM public.sales
    WHERE id = NEW.sale_id;
    IF linked_sale_price IS NOT NULL THEN
      NEW.amount := round(linked_sale_price * 0.03, 2);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.commissions AS commission
SET rate = 3.00,
    amount = round(sale.sale_price * 0.03, 2)
FROM public.sales AS sale
WHERE commission.sale_id = sale.id
  AND commission.status <> 'PAID'
  AND (
    commission.rate IS DISTINCT FROM 3.00
    OR commission.amount IS DISTINCT FROM round(sale.sale_price * 0.03, 2)
  );
