-- Client purchase requests, linked inventory status, and restricted unit financials.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.project_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS buyer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.client_payment_schedule
  ADD COLUMN IF NOT EXISTS buyer_installment_id uuid REFERENCES public.buyer_installments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_schedule_installment
  ON public.client_payment_schedule (buyer_installment_id)
  WHERE buyer_installment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_unit_id ON public.sales (unit_id);
CREATE INDEX IF NOT EXISTS idx_sales_buyer_user_id ON public.sales (buyer_user_id);

CREATE TABLE IF NOT EXISTS public.unit_financials (
  unit_id uuid PRIMARY KEY REFERENCES public.project_units(id) ON DELETE CASCADE,
  recorded_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (recorded_price >= 0),
  construction_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (construction_cost >= 0),
  additional_costs numeric(14,2) NOT NULL DEFAULT 0 CHECK (additional_costs >= 0),
  notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.unit_financials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unit_financials_select_admin" ON public.unit_financials;
CREATE POLICY "unit_financials_select_admin" ON public.unit_financials
  FOR SELECT TO authenticated USING (public.is_dashboard_admin());
DROP POLICY IF EXISTS "unit_financials_insert_admin" ON public.unit_financials;
CREATE POLICY "unit_financials_insert_admin" ON public.unit_financials
  FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_admin());
DROP POLICY IF EXISTS "unit_financials_update_admin" ON public.unit_financials;
CREATE POLICY "unit_financials_update_admin" ON public.unit_financials
  FOR UPDATE TO authenticated USING (public.is_dashboard_admin()) WITH CHECK (public.is_dashboard_admin());
DROP POLICY IF EXISTS "unit_financials_delete_admin" ON public.unit_financials;
CREATE POLICY "unit_financials_delete_admin" ON public.unit_financials
  FOR DELETE TO authenticated USING (public.is_dashboard_admin());

-- Backfill verifiable published unit prices from the legacy text field.
INSERT INTO public.unit_financials (unit_id, recorded_price)
SELECT id, regexp_replace(price, '[^0-9.]', '', 'g')::numeric
FROM public.project_units
WHERE price IS NOT NULL
  AND regexp_replace(price, '[^0-9.]', '', 'g') ~ '^[0-9]+([.][0-9]{1,2})?$'
ON CONFLICT (unit_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_unit_price_from_financials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.project_units
  SET price = CASE
    WHEN NEW.recorded_price > 0 THEN 'KSh ' || to_char(NEW.recorded_price, 'FM999,999,999,990.00')
    ELSE NULL
  END
  WHERE id = NEW.unit_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sync_unit_price_after_financials_write ON public.unit_financials;
CREATE TRIGGER sync_unit_price_after_financials_write
  AFTER INSERT OR UPDATE OF recorded_price ON public.unit_financials
  FOR EACH ROW EXECUTE FUNCTION public.sync_unit_price_from_financials();

UPDATE public.sales s
SET unit_id = matches.id
FROM (
  SELECT unit_number, min(id::text)::uuid AS id
  FROM public.project_units
  GROUP BY unit_number
  HAVING count(*) = 1
) matches
WHERE s.unit_id IS NULL AND s.unit_number = matches.unit_number;

UPDATE public.project_units u
SET status = CASE
  WHEN EXISTS (SELECT 1 FROM public.sales s WHERE s.unit_id = u.id AND s.status = 'COMPLETED') THEN 'SOLD'
  ELSE 'RESERVED'
END
WHERE EXISTS (SELECT 1 FROM public.sales s WHERE s.unit_id = u.id AND s.status IN ('RESERVED', 'DEPOSIT_PAID', 'COMPLETED'));

CREATE OR REPLACE FUNCTION public.search_client_profiles(p_query text)
RETURNS TABLE (user_id uuid, full_name text, phone text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_dashboard_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_query, ''))) < 2 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.phone, u.email::text
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'client'
    AND (
      coalesce(p.full_name, '') ILIKE '%' || btrim(p_query) || '%'
      OR coalesce(u.email, '') ILIKE '%' || btrim(p_query) || '%'
      OR coalesce(p.phone, '') ILIKE '%' || btrim(p_query) || '%'
    )
  ORDER BY p.full_name NULLS LAST, u.email
  LIMIT 8;
END;
$$;
REVOKE ALL ON FUNCTION public.search_client_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_client_profiles(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_sale_unit_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status text;
BEGIN
  IF NEW.unit_id IS NULL OR NEW.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;
  SELECT status INTO current_status
  FROM public.project_units
  WHERE id = NEW.unit_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected unit does not exist';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.unit_id = NEW.unit_id
     AND OLD.status IN ('RESERVED', 'DEPOSIT_PAID', 'COMPLETED') THEN
    RETURN NEW;
  END IF;
  IF current_status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'This unit is no longer available';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_sale_unit_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.unit_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'CANCELLED' THEN
    UPDATE public.project_units u
    SET status = 'AVAILABLE'
    WHERE u.id = NEW.unit_id
      AND NOT EXISTS (
        SELECT 1 FROM public.sales s
        WHERE s.unit_id = NEW.unit_id
          AND s.id <> NEW.id
          AND s.status IN ('RESERVED', 'DEPOSIT_PAID', 'COMPLETED')
      );
  ELSE
    UPDATE public.project_units
    SET status = CASE WHEN NEW.status = 'COMPLETED' THEN 'SOLD' ELSE 'RESERVED' END
    WHERE id = NEW.unit_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_sale_unit_inventory_before_write ON public.sales;
CREATE TRIGGER guard_sale_unit_inventory_before_write
  BEFORE INSERT OR UPDATE OF unit_id, status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_sale_unit_inventory();
DROP TRIGGER IF EXISTS sync_sale_unit_inventory_after_write ON public.sales;
CREATE TRIGGER sync_sale_unit_inventory_after_write
  AFTER INSERT OR UPDATE OF unit_id, status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.sync_sale_unit_inventory();

CREATE OR REPLACE FUNCTION public.create_client_purchase_request(
  p_unit_id uuid,
  p_deposit numeric,
  p_installment_count integer,
  p_frequency text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  buyer_id uuid := auth.uid();
  selected_unit public.project_units%ROWTYPE;
  buyer_name text;
  buyer_phone text;
  buyer_email text;
  home_price numeric(14,2);
  legacy_price text;
  sale_record public.sales%ROWTYPE;
  installment_id uuid;
  installment_amount numeric(14,2);
  remaining_balance numeric(14,2);
  due_step interval;
  installment_index integer;
BEGIN
  IF buyer_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to submit a purchase request' USING ERRCODE = '42501';
  END IF;
  IF p_deposit IS NULL OR p_deposit <= 0 OR p_installment_count < 0 OR p_installment_count > 120 THEN
    RAISE EXCEPTION 'Enter a valid reservation deposit and payment plan';
  END IF;
  IF upper(coalesce(p_frequency, '')) NOT IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY') THEN
    RAISE EXCEPTION 'Select a valid installment frequency';
  END IF;

  SELECT * INTO selected_unit
  FROM public.project_units
  WHERE id = p_unit_id AND is_published = true
  FOR UPDATE;
  IF NOT FOUND OR selected_unit.status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'This home is no longer available';
  END IF;

  SELECT recorded_price INTO home_price
  FROM public.unit_financials
  WHERE unit_id = p_unit_id AND recorded_price > 0;
  IF home_price IS NULL THEN
    legacy_price := regexp_replace(coalesce(selected_unit.price, ''), '[^0-9.]', '', 'g');
    IF legacy_price ~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      home_price := legacy_price::numeric;
    END IF;
  END IF;
  IF home_price IS NULL OR home_price <= 0 THEN
    RAISE EXCEPTION 'Pricing is not confirmed for this home yet';
  END IF;
  IF p_deposit > home_price OR (p_deposit < home_price AND p_installment_count < 1) THEN
    RAISE EXCEPTION 'The deposit and installment count do not cover the home price';
  END IF;

  SELECT full_name, phone INTO buyer_name, buyer_phone
  FROM public.profiles WHERE id = buyer_id;
  SELECT email::text, coalesce(buyer_name, raw_user_meta_data ->> 'full_name')
    INTO buyer_email, buyer_name
  FROM auth.users WHERE id = buyer_id;
  IF coalesce(buyer_name, '') = '' THEN
    buyer_name := buyer_email;
  END IF;

  INSERT INTO public.sales (
    unit_id, unit_number, buyer_user_id, buyer_name, buyer_phone, buyer_email,
    sale_price, status, sale_date, deposit_amount, installment_count,
    installment_frequency, notes
  ) VALUES (
    p_unit_id, selected_unit.unit_number, buyer_id, buyer_name, buyer_phone, buyer_email,
    home_price, 'RESERVED', current_date, 0, p_installment_count + 1,
    upper(p_frequency), 'Client purchase request. Reservation deposit is pending NBG confirmation.'
  ) RETURNING * INTO sale_record;

  INSERT INTO public.buyer_installments (
    sale_id, installment_number, due_date, amount, status, notes
  ) VALUES (
    sale_record.id, 1, current_date, p_deposit, 'PENDING', 'Reservation deposit pending confirmation'
  ) RETURNING id INTO installment_id;
  INSERT INTO public.client_payment_schedule (
    user_id, project_id, unit_id, buyer_installment_id, description, due_date, amount, status
  ) VALUES (
    buyer_id, selected_unit.project_id, p_unit_id, installment_id,
    'Reservation deposit · Unit ' || selected_unit.unit_number, current_date, p_deposit, 'PENDING'
  );

  remaining_balance := home_price - p_deposit;
  due_step := CASE upper(p_frequency)
    WHEN 'QUARTERLY' THEN interval '3 months'
    WHEN 'ANNUALLY' THEN interval '1 year'
    ELSE interval '1 month'
  END;
  IF p_installment_count > 0 AND remaining_balance > 0 THEN
    FOR installment_index IN 1..p_installment_count LOOP
      IF installment_index = p_installment_count THEN
        installment_amount := remaining_balance;
      ELSE
        installment_amount := round((home_price - p_deposit) / p_installment_count, 2);
        remaining_balance := remaining_balance - installment_amount;
      END IF;
      INSERT INTO public.buyer_installments (
        sale_id, installment_number, due_date, amount, status
      ) VALUES (
        sale_record.id, installment_index + 1,
        (current_date + due_step * installment_index)::date,
        installment_amount, 'PENDING'
      ) RETURNING id INTO installment_id;
      INSERT INTO public.client_payment_schedule (
        user_id, project_id, unit_id, buyer_installment_id, description, due_date, amount, status
      ) VALUES (
        buyer_id, selected_unit.project_id, p_unit_id, installment_id,
        'Installment ' || installment_index || ' · Unit ' || selected_unit.unit_number,
        (current_date + due_step * installment_index)::date, installment_amount, 'PENDING'
      );
    END LOOP;
  END IF;

  INSERT INTO public.client_reservation_stages (user_id, project_id, unit_id, stage, notes)
  VALUES
    (buyer_id, selected_unit.project_id, p_unit_id, 'RESERVATION', 'Purchase request submitted; deposit pending confirmation.'),
    (buyer_id, selected_unit.project_id, p_unit_id, 'DEPOSIT', 'Reservation deposit is scheduled and awaiting payment confirmation.');

  RETURN sale_record.id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_client_purchase_request(uuid, numeric, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_client_purchase_request(uuid, numeric, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_client_payment_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.installment_id IS NOT NULL THEN
    UPDATE public.client_payment_schedule
    SET paid_amount = least(amount, paid_amount + NEW.amount),
        status = CASE
          WHEN least(amount, paid_amount + NEW.amount) >= amount THEN 'PAID'
          WHEN least(amount, paid_amount + NEW.amount) > 0 THEN 'PARTIAL'
          ELSE status
        END
    WHERE buyer_installment_id = NEW.installment_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sync_client_payment_schedule_after_payment ON public.buyer_payments;
CREATE TRIGGER sync_client_payment_schedule_after_payment
  AFTER INSERT ON public.buyer_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_client_payment_schedule();
