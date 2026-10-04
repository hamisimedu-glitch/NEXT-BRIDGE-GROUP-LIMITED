ALTER TABLE public.investment_transactions
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS months_covered integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS covers_full_balance boolean NOT NULL DEFAULT false;

UPDATE public.investment_transactions
SET period_start = date_trunc('month', transaction_date)::date,
    months_covered = 1
WHERE transaction_type IN ('COMMITMENT', 'DEPOSIT')
  AND period_start IS NULL;

ALTER TABLE public.investment_transactions
  DROP CONSTRAINT IF EXISTS investment_transactions_months_covered_check,
  ADD CONSTRAINT investment_transactions_months_covered_check
    CHECK (months_covered BETWEEN 1 AND 120),
  DROP CONSTRAINT IF EXISTS investment_transactions_period_start_check,
  ADD CONSTRAINT investment_transactions_period_start_check CHECK (
      (transaction_type IN ('COMMITMENT', 'DEPOSIT') AND period_start IS NOT NULL)
      OR (transaction_type NOT IN ('COMMITMENT', 'DEPOSIT') AND period_start IS NULL AND NOT covers_full_balance)
  );

CREATE INDEX IF NOT EXISTS idx_investment_transactions_period
  ON public.investment_transactions(investment_id, period_start DESC)
  WHERE period_start IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_monthly_investment_transactions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_period date;
  current_period date := date_trunc('month', current_date)::date;
  committed_total numeric;
  already_contributed numeric;
BEGIN
  IF NEW.transaction_date > current_date THEN
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

  IF NEW.period_start > current_period AND NEW.months_covered = 1 AND NOT NEW.covers_full_balance THEN
    RAISE EXCEPTION 'A single contribution cannot be recorded for a future month. Use a multi-month prepayment or wait until that month.' USING ERRCODE = '22023';
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

DROP TRIGGER IF EXISTS guard_monthly_investment_transactions ON public.investment_transactions;
CREATE TRIGGER guard_monthly_investment_transactions
  BEFORE INSERT OR UPDATE ON public.investment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_monthly_investment_transactions();
