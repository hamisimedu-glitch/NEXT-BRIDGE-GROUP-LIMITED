/*
# Autogenerate sale unit references

The UI normally uses an available inventory unit. If a sale is recorded without
an inventory unit, AUTO is converted into a unique sale reference in the database.
*/

CREATE OR REPLACE FUNCTION public.generate_sale_unit_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  today_prefix text := 'SALE-' || to_char(current_date, 'YYYYMMDD') || '-';
  next_sequence integer;
BEGIN
  IF NEW.unit_number IS NULL OR btrim(NEW.unit_number) IN ('', 'AUTO') THEN
    PERFORM pg_advisory_xact_lock(hashtext(today_prefix));
    SELECT coalesce(max((right(unit_number, 3))::integer), 0) + 1
      INTO next_sequence
      FROM public.sales
     WHERE unit_number LIKE today_prefix || '%';
    NEW.unit_number := today_prefix || lpad(next_sequence::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generate_sale_unit_number_before_insert ON public.sales;
CREATE TRIGGER generate_sale_unit_number_before_insert
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.generate_sale_unit_number();
