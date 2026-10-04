ALTER TABLE public.buyer_payments
  ALTER COLUMN payment_date SET DEFAULT ((now() AT TIME ZONE 'Africa/Nairobi')::date);

ALTER TABLE public.investment_transactions
  ALTER COLUMN transaction_date SET DEFAULT ((now() AT TIME ZONE 'Africa/Nairobi')::date);

CREATE OR REPLACE FUNCTION public.guard_monthly_investment_transactions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  local_today date := (now() AT TIME ZONE 'Africa/Nairobi')::date;
  current_period date := date_trunc('month', now() AT TIME ZONE 'Africa/Nairobi')::date;
  next_period date;
  committed_total numeric;
  already_contributed numeric;
BEGIN
  IF NEW.transaction_date > local_today THEN
    RAISE EXCEPTION 'A transaction cannot be recorded before it has occurred' USING ERRCODE = '22023';
  END IF;

  IF NEW.transaction_type NOT IN ('COMMITMENT', 'DEPOSIT') THEN
    NEW.period_start := NULL;
    NEW.months_covered := 1;
    NEW.covers_full_balance := false;
    RETURN NEW;
  END IF;

  IF NEW.period_start IS NULL OR NEW.period_start <> date_trunc('month', NEW.period_start)::date THEN
    RAISE EXCEPTION 'A monthly contribution period is required' USING ERRCODE = '22023';
  END IF;
  IF NEW.months_covered NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Months covered must be between 1 and 120' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.investment_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.investment_transactions
    WHERE investment_id = NEW.investment_id
      AND covers_full_balance
      AND (TG_OP = 'INSERT' OR id <> NEW.id)
  ) THEN
    RAISE EXCEPTION 'This investor commitment has already been fully settled' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    max((period_start + make_interval(months => months_covered))::date),
    current_period
  )
  INTO next_period
  FROM public.investment_transactions
  WHERE investment_id = NEW.investment_id
    AND transaction_type IN ('COMMITMENT', 'DEPOSIT')
    AND period_start IS NOT NULL
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF NEW.period_start <> next_period THEN
    RAISE EXCEPTION 'Contribution month must follow the recorded sequence. Next expected month: %', to_char(next_period, 'YYYY-MM') USING ERRCODE = '22023';
  END IF;

  IF (NEW.period_start > current_period OR NEW.months_covered > 1) AND NOT NEW.covers_full_balance THEN
    RAISE EXCEPTION 'Future-month or multi-month contributions require full settlement of the outstanding commitment' USING ERRCODE = '22023';
  END IF;

  IF NEW.covers_full_balance THEN
    SELECT amount_committed INTO committed_total
    FROM public.investments WHERE id = NEW.investment_id;
    SELECT COALESCE(sum(amount), 0) INTO already_contributed
    FROM public.investment_transactions
    WHERE investment_id = NEW.investment_id
      AND transaction_type IN ('COMMITMENT', 'DEPOSIT')
      AND (TG_OP = 'INSERT' OR id <> NEW.id);
    IF committed_total IS NULL OR NEW.amount <> committed_total - already_contributed THEN
      RAISE EXCEPTION 'Full settlement must exactly match the outstanding committed amount (%)', COALESCE(committed_total - already_contributed, 0) USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
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
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Payment receipts are immutable. Record a separate correcting transaction instead of editing an existing receipt.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.payment_date > local_today THEN
    RAISE EXCEPTION 'Payment date cannot be in the future. Record a payment only after funds have actually been received.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.installment_id IS NULL THEN
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

DROP TRIGGER IF EXISTS guard_buyer_payment_recording ON public.buyer_payments;
CREATE TRIGGER guard_buyer_payment_recording
  BEFORE INSERT OR UPDATE ON public.buyer_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_buyer_payment_recording();

DROP POLICY IF EXISTS "role_update_buyer_payments" ON public.buyer_payments;
REVOKE UPDATE ON public.buyer_payments FROM authenticated;

CREATE OR REPLACE FUNCTION public.validate_investment_advance_requirements()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  local_today date := (now() AT TIME ZONE 'Africa/Nairobi')::date;
  current_month date := date_trunc('month', (now() AT TIME ZONE 'Africa/Nairobi'))::date;
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.investment_id IS NOT DISTINCT FROM OLD.investment_id
    AND NEW.transaction_type IS NOT DISTINCT FROM OLD.transaction_type
    AND NEW.amount IS NOT DISTINCT FROM OLD.amount
    AND NEW.transaction_date IS NOT DISTINCT FROM OLD.transaction_date
    AND NEW.period_start IS NOT DISTINCT FROM OLD.period_start
    AND NEW.months_covered IS NOT DISTINCT FROM OLD.months_covered
    AND NEW.covers_full_balance IS NOT DISTINCT FROM OLD.covers_full_balance THEN
    RETURN NEW;
  END IF;

  IF NEW.transaction_date > local_today THEN
    RAISE EXCEPTION 'Transaction date cannot be in the future. Record funds only after they have been received.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.transaction_type IN ('COMMITMENT', 'DEPOSIT')
    AND (NEW.period_start > current_month OR NEW.months_covered > 1)
    AND NOT NEW.covers_full_balance THEN
    RAISE EXCEPTION 'Advance contributions covering future months require full settlement of the outstanding commitment.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_investment_advance_requirements ON public.investment_transactions;
CREATE TRIGGER validate_investment_advance_requirements
  BEFORE INSERT OR UPDATE ON public.investment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_investment_advance_requirements();

NOTIFY pgrst, 'reload schema';
