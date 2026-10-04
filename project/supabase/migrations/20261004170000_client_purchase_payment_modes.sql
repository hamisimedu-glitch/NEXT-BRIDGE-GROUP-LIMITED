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
  sale_price numeric(14,2);
  unit_number text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to submit a purchase request' USING ERRCODE = '42501';
  END IF;
  IF upper(coalesce(p_payment_mode, '')) NOT IN ('INSTALLMENTS', 'FULL') THEN
    RAISE EXCEPTION 'Select a valid payment plan';
  END IF;
  IF upper(p_payment_mode) = 'FULL' AND p_installment_count <> 0 THEN
    RAISE EXCEPTION 'A one-time payment cannot include installments';
  END IF;

  created_sale_id := public.create_client_purchase_request(
    p_unit_id,
    p_deposit,
    p_installment_count,
    p_frequency
  );

  SELECT sale.sale_price, sale.unit_number
  INTO sale_price, unit_number
  FROM public.sales AS sale
  WHERE sale.id = created_sale_id;

  IF upper(p_payment_mode) = 'FULL' THEN
    IF p_deposit <> sale_price THEN
      RAISE EXCEPTION 'A one-time payment request must cover the full confirmed unit price';
    END IF;

    UPDATE public.sales
    SET installment_frequency = 'ONE_TIME',
      notes = 'Client purchase request. Full one-time amount pending NBG payment verification.'
    WHERE id = created_sale_id;

    UPDATE public.buyer_installments
    SET notes = 'Full one-time payment pending NBG verification.'
    WHERE sale_id = created_sale_id AND installment_number = 1;

    UPDATE public.client_payment_schedule
    SET description = 'One-time payment · Unit ' || unit_number
    WHERE buyer_installment_id IN (
      SELECT installment.id
      FROM public.buyer_installments AS installment
      WHERE installment.sale_id = created_sale_id
    );

    UPDATE public.client_reservation_stages AS stage
    SET notes = 'One-time payment request submitted; payment pending NBG verification.'
    WHERE stage.id = (
      SELECT latest_stage.id
      FROM public.client_reservation_stages AS latest_stage
      WHERE latest_stage.user_id = auth.uid()
        AND latest_stage.unit_id = p_unit_id
        AND latest_stage.stage = 'DEPOSIT'
      ORDER BY latest_stage.created_at DESC
      LIMIT 1
    );
  END IF;

  RETURN created_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_client_purchase_request_with_mode(uuid, numeric, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_client_purchase_request_with_mode(uuid, numeric, integer, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_client_purchase_request(uuid, numeric, integer, text) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'client_payment_schedule'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_payment_schedule;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_buyer_payment_recording()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  local_today date := (now() AT TIME ZONE 'Africa/Nairobi')::date;
  installment_sale_id uuid;
  selected_installment_number integer;
  installment_amount numeric;
  installment_paid numeric;
  selected_payment_mode text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Payment receipts are immutable. Record a separate correcting transaction instead of editing an existing receipt.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.payment_date > local_today THEN
    RAISE EXCEPTION 'Payment date cannot be in the future. Record a payment only after funds have actually been received.'
      USING ERRCODE = '22023';
  END IF;

  SELECT installment_frequency INTO selected_payment_mode
  FROM public.sales
  WHERE id = NEW.sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected sale does not exist' USING ERRCODE = '22023';
  END IF;

  IF NEW.installment_id IS NULL THEN
    IF selected_payment_mode = 'ONE_TIME' THEN
      RAISE EXCEPTION 'One-time payments must be allocated to the full-price payment schedule' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  SELECT sale_id, buyer_installments.installment_number, amount, paid_amount
  INTO installment_sale_id, selected_installment_number, installment_amount, installment_paid
  FROM public.buyer_installments
  WHERE id = NEW.installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected installment does not exist' USING ERRCODE = '22023';
  END IF;
  IF installment_sale_id <> NEW.sale_id THEN
    RAISE EXCEPTION 'The selected installment does not belong to this sale' USING ERRCODE = '22023';
  END IF;
  IF NEW.amount > installment_amount - installment_paid THEN
    RAISE EXCEPTION 'Payment exceeds the remaining installment balance (%)', installment_amount - installment_paid
      USING ERRCODE = '22023';
  END IF;
  IF selected_payment_mode = 'ONE_TIME' AND (
    selected_installment_number <> 1
    OR NEW.amount <> installment_amount - installment_paid
    OR EXISTS (SELECT 1 FROM public.buyer_payments WHERE sale_id = NEW.sale_id)
  ) THEN
    RAISE EXCEPTION 'A one-time payment must settle the full balance in one recorded transaction' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.buyer_installments AS earlier
    WHERE earlier.sale_id = NEW.sale_id
      AND earlier.installment_number < selected_installment_number
      AND earlier.paid_amount < earlier.amount
  ) THEN
    RAISE EXCEPTION 'Record installments in sequence. Settle earlier installments before this one.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
