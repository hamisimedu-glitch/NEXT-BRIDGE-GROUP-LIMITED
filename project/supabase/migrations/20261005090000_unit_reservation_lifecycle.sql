ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS reservation_source text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS reservation_reason text;

UPDATE public.sales AS sale
SET reservation_source = 'LEGACY'
WHERE sale.reservation_source IS NULL;

UPDATE public.sales AS sale
SET status = 'DEPOSIT_PAID',
    reservation_expires_at = NULL
WHERE sale.status = 'RESERVED'
  AND EXISTS (SELECT 1 FROM public.buyer_payments AS payment WHERE payment.sale_id = sale.id);

UPDATE public.sales AS sale
SET reservation_expires_at = coalesce(sale.created_at, now()) + interval '48 hours'
WHERE sale.status = 'RESERVED'
  AND sale.reservation_expires_at IS NULL;

ALTER TABLE public.sales ALTER COLUMN reservation_source SET DEFAULT 'BUYER';
CREATE INDEX IF NOT EXISTS idx_sales_reservation_expiry
  ON public.sales (reservation_expires_at)
  WHERE unit_id IS NOT NULL AND status = 'RESERVED';

CREATE OR REPLACE FUNCTION public.set_unit_reservation_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.unit_id IS NOT NULL AND NEW.status = 'RESERVED' AND NEW.reservation_expires_at IS NULL THEN
    NEW.reservation_expires_at := now() + interval '48 hours';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_unit_reservation_expiry_before_insert ON public.sales;
CREATE TRIGGER set_unit_reservation_expiry_before_insert
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_unit_reservation_expiry();

CREATE OR REPLACE FUNCTION public.sync_sale_unit_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.unit_id IS NOT NULL THEN
      RAISE EXCEPTION 'Inventory-linked sale records cannot be deleted; cancel or expire the reservation through its lifecycle.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'CANCELLED' THEN
    PERFORM set_config('nbg.allow_unit_status_transition', 'on', true);
    UPDATE public.project_units AS unit
    SET status = 'AVAILABLE'
    WHERE unit.id = NEW.unit_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.sales AS sale
        WHERE sale.unit_id = NEW.unit_id
          AND sale.id <> NEW.id
          AND sale.status IN ('RESERVED', 'DEPOSIT_PAID', 'COMPLETED')
      );
  ELSE
    PERFORM set_config('nbg.allow_unit_status_transition', 'on', true);
    UPDATE public.project_units AS unit
    SET status = CASE
      WHEN NEW.status IN ('DEPOSIT_PAID', 'COMPLETED')
        OR EXISTS (SELECT 1 FROM public.buyer_payments AS payment WHERE payment.sale_id = NEW.id)
      THEN 'SOLD'
      ELSE 'RESERVED'
    END
    WHERE unit.id = NEW.unit_id;
  END IF;
  PERFORM set_config('nbg.allow_unit_status_transition', 'off', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_sale_unit_inventory_after_write ON public.sales;
CREATE TRIGGER sync_sale_unit_inventory_after_write
  AFTER INSERT OR UPDATE OF unit_id, status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.sync_sale_unit_inventory();

DROP TRIGGER IF EXISTS guard_inventory_sale_delete ON public.sales;
CREATE TRIGGER guard_inventory_sale_delete
  BEFORE DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.sync_sale_unit_inventory();

CREATE OR REPLACE FUNCTION public.guard_unit_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'AVAILABLE';
    RETURN NEW;
  END IF;
  IF current_setting('nbg.allow_unit_status_transition', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Unit status is managed by reservations and recorded payments' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_unit_status_transition_before_write ON public.project_units;
CREATE TRIGGER guard_unit_status_transition_before_write
  BEFORE INSERT OR UPDATE OF status ON public.project_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_unit_status_transition();

CREATE OR REPLACE FUNCTION public.guard_unit_inventory_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sales AS sale WHERE sale.unit_id = OLD.id) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'A unit with a purchase history cannot be deleted' USING ERRCODE = '42501';
    END IF;
    IF NEW.unit_number IS DISTINCT FROM OLD.unit_number OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'A unit with a purchase history cannot be renumbered or moved to another project' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_unit_inventory_identity_before_write ON public.project_units;
CREATE TRIGGER guard_unit_inventory_identity_before_write
  BEFORE UPDATE OF unit_number, project_id OR DELETE ON public.project_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_unit_inventory_identity();

SELECT set_config('nbg.allow_unit_status_transition', 'on', true);
UPDATE public.project_units AS unit
SET status = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.sales AS sale
    WHERE sale.unit_id = unit.id
      AND (sale.status IN ('DEPOSIT_PAID', 'COMPLETED')
        OR EXISTS (SELECT 1 FROM public.buyer_payments AS payment WHERE payment.sale_id = sale.id))
  ) THEN 'SOLD'
  WHEN EXISTS (
    SELECT 1 FROM public.sales AS sale
    WHERE sale.unit_id = unit.id
      AND sale.status = 'RESERVED'
      AND sale.reservation_expires_at > now()
  ) THEN 'RESERVED'
  WHEN unit.status = 'SOLD' THEN 'SOLD'
  ELSE 'AVAILABLE'
END;
SELECT set_config('nbg.allow_unit_status_transition', 'off', true);

CREATE OR REPLACE FUNCTION public.expire_unit_reservations(p_unit_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.sales AS sale
    SET status = 'CANCELLED',
        notes = concat_ws(E'\n', nullif(sale.notes, ''), 'Reservation expired without a recorded payment.')
    WHERE sale.status = 'RESERVED'
      AND sale.reservation_expires_at <= clock_timestamp()
      AND (p_unit_id IS NULL OR sale.unit_id = p_unit_id)
      AND NOT EXISTS (SELECT 1 FROM public.buyer_payments AS payment WHERE payment.sale_id = sale.id)
    RETURNING sale.buyer_user_id, sale.unit_id, sale.unit_number
  ), notified AS (
    INSERT INTO public.client_notifications (user_id, title, body, kind)
    SELECT expired.buyer_user_id,
           'Reservation expired',
           format('The reservation for Unit %s expired without a recorded payment. The home is available again.', expired.unit_number),
           'UNIT_RESERVATION_EXPIRED'
    FROM expired
    WHERE expired.buyer_user_id IS NOT NULL
    RETURNING id
  )
  SELECT count(*)::integer INTO expired_count FROM expired;
  RETURN expired_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_unit_reservations(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_unit_reservations()
RETURNS TABLE (sale_id uuid, unit_id uuid, project_id uuid, unit_number text, expires_at timestamptz, reservation_source text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sale.id, sale.unit_id, unit.project_id, sale.unit_number, sale.reservation_expires_at, sale.reservation_source
  FROM public.sales AS sale
  JOIN public.project_units AS unit ON unit.id = sale.unit_id
  WHERE sale.buyer_user_id = auth.uid()
    AND sale.status = 'RESERVED'
    AND sale.reservation_expires_at > now()
  ORDER BY sale.reservation_expires_at;
$$;
REVOKE ALL ON FUNCTION public.get_my_unit_reservations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_unit_reservations() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_purchase_payment_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sale_status text;
  sale_expiration timestamptz;
  sale_unit_id uuid;
BEGIN
  SELECT sale.status, sale.reservation_expires_at, sale.unit_id
  INTO sale_status, sale_expiration, sale_unit_id
  FROM public.sales AS sale
  WHERE sale.id = NEW.sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected sale does not exist' USING ERRCODE = '22023';
  END IF;
  IF sale_unit_id IS NOT NULL AND sale_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'This reservation has expired or been released. Create a new reservation before recording payment.' USING ERRCODE = '22023';
  END IF;
  IF sale_unit_id IS NOT NULL AND sale_status = 'RESERVED' AND sale_expiration <= clock_timestamp() THEN
    RAISE EXCEPTION 'This reservation has expired. The unit must be made available before payment can be recorded.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_a_purchase_reservation_before_payment ON public.buyer_payments;
CREATE TRIGGER guard_a_purchase_reservation_before_payment
  BEFORE INSERT ON public.buyer_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_payment_reservation();

CREATE OR REPLACE FUNCTION public.promote_reserved_unit_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sales AS sale
  SET status = CASE
    WHEN coalesce((SELECT sum(payment.amount) FROM public.buyer_payments AS payment WHERE payment.sale_id = sale.id), 0) >= coalesce(sale.sale_price, 0)
    THEN 'COMPLETED'
    ELSE 'DEPOSIT_PAID'
  END
  WHERE sale.id = NEW.sale_id
    AND sale.status IN ('RESERVED', 'DEPOSIT_PAID');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promote_reserved_unit_after_payment ON public.buyer_payments;
CREATE TRIGGER promote_reserved_unit_after_payment
  AFTER INSERT ON public.buyer_payments
  FOR EACH ROW EXECUTE FUNCTION public.promote_reserved_unit_after_payment();

CREATE OR REPLACE FUNCTION public.reserve_unit_for_client(
  p_unit_id uuid,
  p_buyer_user_id uuid,
  p_reservation_hours integer,
  p_reason text,
  p_initial_payment numeric,
  p_installment_count integer,
  p_frequency text
)
RETURNS TABLE (sale_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_unit public.project_units%ROWTYPE;
  buyer_name text;
  buyer_phone text;
  buyer_email text;
  unit_price numeric(14,2);
  generated_sale_id uuid;
  reservation_expiry timestamptz;
  first_installment_id uuid;
  remaining_balance numeric(14,2);
  installment_amount numeric(14,2);
  due_step interval;
  installment_index integer;
BEGIN
  IF NOT public.is_dashboard_admin() THEN
    RAISE EXCEPTION 'Owner or admin access is required to override unit availability' USING ERRCODE = '42501';
  END IF;
  IF p_reservation_hours IS NULL OR p_reservation_hours < 1 OR p_reservation_hours > 168 THEN
    RAISE EXCEPTION 'Admin reservations must be between 1 and 168 hours' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 12 OR length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Enter a reservation reason between 12 and 500 characters' USING ERRCODE = '22023';
  END IF;
  IF p_installment_count IS NULL OR p_installment_count < 0 OR p_installment_count > 120
    OR upper(coalesce(p_frequency, '')) NOT IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY') THEN
    RAISE EXCEPTION 'Select a valid installment count and frequency' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_buyer_user_id AND role = 'client') THEN
    RAISE EXCEPTION 'Select a registered client account for this reservation' USING ERRCODE = '22023';
  END IF;

  PERFORM public.expire_unit_reservations(p_unit_id);

  SELECT * INTO selected_unit
  FROM public.project_units
  WHERE id = p_unit_id AND is_published = true
  FOR UPDATE;
  IF NOT FOUND OR selected_unit.status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'This unit is not available to reserve' USING ERRCODE = '22023';
  END IF;

  SELECT profile.full_name, profile.phone, account.email::text
  INTO buyer_name, buyer_phone, buyer_email
  FROM public.profiles AS profile
  JOIN auth.users AS account ON account.id = profile.id
  WHERE profile.id = p_buyer_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected client account could not be loaded' USING ERRCODE = '22023';
  END IF;

  SELECT financial.recorded_price INTO unit_price
  FROM public.unit_financials AS financial
  WHERE financial.unit_id = p_unit_id AND financial.recorded_price > 0;
  IF unit_price IS NULL THEN
    IF regexp_replace(coalesce(selected_unit.price, ''), '[^0-9.]', '', 'g') ~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      unit_price := regexp_replace(selected_unit.price, '[^0-9.]', '', 'g')::numeric;
    END IF;
  END IF;
  IF unit_price IS NULL OR unit_price <= 0
    OR p_initial_payment IS NULL OR p_initial_payment <= 0 OR p_initial_payment > unit_price
    OR (p_initial_payment < unit_price AND p_installment_count < 1) THEN
    RAISE EXCEPTION 'Set a valid initial payment and installment plan for the confirmed unit price' USING ERRCODE = '22023';
  END IF;

  reservation_expiry := clock_timestamp() + make_interval(hours => p_reservation_hours);
  INSERT INTO public.sales (
    unit_id, unit_number, buyer_user_id, buyer_name, buyer_phone, buyer_email,
    sale_price, status, sale_date, deposit_amount, installment_count,
    installment_frequency, notes, reservation_expires_at, reservation_source, reservation_reason
  ) VALUES (
    p_unit_id, selected_unit.unit_number, p_buyer_user_id, coalesce(nullif(btrim(buyer_name), ''), buyer_email), buyer_phone, buyer_email,
    unit_price, 'RESERVED', (now() AT TIME ZONE 'Africa/Nairobi')::date, 0, p_installment_count + 1,
    CASE WHEN p_initial_payment = unit_price THEN 'ONE_TIME' ELSE upper(p_frequency) END,
    'Admin reservation; no payment has been recorded.', reservation_expiry, 'ADMIN', btrim(p_reason)
  ) RETURNING id INTO generated_sale_id;

  INSERT INTO public.buyer_installments (sale_id, installment_number, due_date, amount, status, notes)
  VALUES (generated_sale_id, 1, (reservation_expiry AT TIME ZONE 'Africa/Nairobi')::date, p_initial_payment, 'PENDING', 'Initial payment pending confirmation')
  RETURNING id INTO first_installment_id;
  INSERT INTO public.client_payment_schedule (user_id, project_id, unit_id, buyer_installment_id, description, due_date, amount, status, payment_reference)
  VALUES (p_buyer_user_id, selected_unit.project_id, p_unit_id, first_installment_id, 'Initial payment · Unit ' || selected_unit.unit_number, (reservation_expiry AT TIME ZONE 'Africa/Nairobi')::date, p_initial_payment, 'PENDING', 'NBG-PURCHASE-' || upper(replace(generated_sale_id::text, '-', '')));

  remaining_balance := unit_price - p_initial_payment;
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
        installment_amount := round((unit_price - p_initial_payment) / p_installment_count, 2);
        remaining_balance := remaining_balance - installment_amount;
      END IF;
      INSERT INTO public.buyer_installments (sale_id, installment_number, due_date, amount, status)
      VALUES (generated_sale_id, installment_index + 1,
        ((now() AT TIME ZONE 'Africa/Nairobi')::date + due_step * installment_index)::date,
        installment_amount, 'PENDING')
      RETURNING id INTO first_installment_id;
      INSERT INTO public.client_payment_schedule (user_id, project_id, unit_id, buyer_installment_id, description, due_date, amount, status, payment_reference)
      VALUES (p_buyer_user_id, selected_unit.project_id, p_unit_id, first_installment_id,
        'Installment ' || installment_index || ' · Unit ' || selected_unit.unit_number,
        ((now() AT TIME ZONE 'Africa/Nairobi')::date + due_step * installment_index)::date,
        installment_amount, 'PENDING', 'NBG-PURCHASE-' || upper(replace(generated_sale_id::text, '-', '')));
    END LOOP;
  END IF;

  INSERT INTO public.client_reservation_stages (user_id, project_id, unit_id, stage, notes)
  VALUES
    (p_buyer_user_id, selected_unit.project_id, p_unit_id, 'RESERVATION', 'NBG reserved this unit for you. Payment must be recorded before the reservation expires.'),
    (p_buyer_user_id, selected_unit.project_id, p_unit_id, 'DEPOSIT', 'The initial payment is scheduled and awaiting payment confirmation.');

  INSERT INTO public.client_notifications (user_id, title, body, kind)
  VALUES (p_buyer_user_id, 'Home reserved for you', format('Unit %s has been reserved for %s hours. Contact your NBG consultant to confirm the payment plan.', selected_unit.unit_number, p_reservation_hours), 'UNIT_RESERVED');

  RETURN QUERY SELECT generated_sale_id, reservation_expiry;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_unit_for_client(uuid, uuid, integer, text, numeric, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_unit_for_client(uuid, uuid, integer, text, numeric, integer, text) TO authenticated;

ALTER FUNCTION public.create_client_purchase_request_with_mode(uuid, numeric, integer, text, text)
  RENAME TO create_client_purchase_request_with_mode_v1;
REVOKE ALL ON FUNCTION public.create_client_purchase_request_with_mode_v1(uuid, numeric, integer, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_client_purchase_request_with_mode(
  p_unit_id uuid,
  p_deposit numeric,
  p_installment_count integer,
  p_frequency text,
  p_payment_mode text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_sale_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to submit a purchase request' USING ERRCODE = '42501';
  END IF;

  PERFORM public.expire_unit_reservations(p_unit_id);
  created_sale_id := public.create_client_purchase_request_with_mode_v1(
    p_unit_id, p_deposit, p_installment_count, p_frequency, p_payment_mode
  );
  UPDATE public.buyer_installments AS installment
  SET due_date = (sale.reservation_expires_at AT TIME ZONE 'Africa/Nairobi')::date
  FROM public.sales AS sale
  WHERE sale.id = created_sale_id
    AND installment.sale_id = sale.id
    AND installment.installment_number = 1;
  UPDATE public.client_payment_schedule AS schedule
  SET due_date = installment.due_date
  FROM public.buyer_installments AS installment
  WHERE installment.sale_id = created_sale_id
    AND installment.installment_number = 1
    AND schedule.buyer_installment_id = installment.id;
  RETURN created_sale_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_client_purchase_request_with_mode(uuid, numeric, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_client_purchase_request_with_mode(uuid, numeric, integer, text, text) TO authenticated;

DROP POLICY IF EXISTS role_insert_sales ON public.sales;
CREATE POLICY role_insert_sales ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_dashboard_staff()
    AND unit_id IS NULL
    AND status = 'RESERVED'
    AND buyer_user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles AS profile WHERE profile.id = buyer_user_id AND profile.role = 'client')
  );

REVOKE UPDATE ON public.sales FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON public.project_units FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (status) ON public.project_units FROM PUBLIC, anon, authenticated;
GRANT UPDATE (project_id, unit_number, type, bedrooms, size, floor, parking, view, price, image_url, is_published, property_category, availability_note)
  ON public.project_units TO authenticated;

SELECT public.expire_unit_reservations(NULL);

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nbg-expire-unit-reservations';
  PERFORM cron.schedule('nbg-expire-unit-reservations', '* * * * *', 'SELECT public.expire_unit_reservations(NULL);');

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'project_units'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_units;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';