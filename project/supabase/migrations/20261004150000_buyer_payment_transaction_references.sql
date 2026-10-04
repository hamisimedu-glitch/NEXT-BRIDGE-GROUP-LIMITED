ALTER TABLE public.buyer_payments
  ADD COLUMN IF NOT EXISTS transaction_ref text,
  ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.client_payment_schedule
  ADD COLUMN IF NOT EXISTS transaction_refs text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.buyer_payments DISABLE TRIGGER guard_buyer_payment_recording;

UPDATE public.buyer_payments AS payment
SET transaction_ref = 'NBG-PAY-' || to_char(payment.payment_date, 'YYYYMMDD') || '-LEGACY-' || upper(substr(md5(payment.id::text), 1, 12)),
    recorded_by = coalesce(payment.recorded_by, (
      SELECT log.actor_id
      FROM public.audit_logs AS log
      WHERE log.entity_type = 'buyer_payments'
        AND log.entity_id = payment.id
        AND log.action = 'INSERT'
      ORDER BY log.created_at
      LIMIT 1
    ))
WHERE payment.transaction_ref IS NULL;

UPDATE public.buyer_payments AS payment
SET transaction_ref = 'NBG-PAY-' || to_char(payment.payment_date, 'YYYYMMDD') || '-LEGACY-' || upper(substr(md5(payment.id::text), 1, 12))
WHERE payment.transaction_ref IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_buyer_payments_transaction_ref
  ON public.buyer_payments(transaction_ref);

CREATE OR REPLACE FUNCTION public.assign_buyer_payment_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payment receipts are immutable and cannot be deleted. Record a separate correcting transaction instead.' USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.transaction_ref := 'NBG-PAY-' || to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYYMMDD') || '-' || upper(replace(gen_random_uuid()::text, '-', ''));
    NEW.recorded_by := auth.uid();
    NEW.created_at := now();
    IF NEW.payment_date IS NULL THEN
      NEW.payment_date := (now() AT TIME ZONE 'Africa/Nairobi')::date;
    END IF;
    IF NEW.method NOT IN ('MPESA', 'CASH', 'BANK_TRANSFER', 'CARD', 'OTHER') THEN
      RAISE EXCEPTION 'Unsupported payment method' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.transaction_ref IS DISTINCT FROM OLD.transaction_ref
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
    OR NEW.sale_id IS DISTINCT FROM OLD.sale_id
    OR NEW.installment_id IS DISTINCT FROM OLD.installment_id
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.reference IS DISTINCT FROM OLD.reference
    OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    RAISE EXCEPTION 'Payment receipts are immutable. Record a separate correcting transaction instead.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_buyer_payment_reference ON public.buyer_payments;
CREATE TRIGGER assign_buyer_payment_reference
  BEFORE INSERT OR UPDATE OR DELETE ON public.buyer_payments
  FOR EACH ROW EXECUTE FUNCTION public.assign_buyer_payment_reference();

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
        END,
        transaction_refs = CASE
          WHEN NEW.transaction_ref = ANY(transaction_refs) THEN transaction_refs
          ELSE array_append(transaction_refs, NEW.transaction_ref)
        END
    WHERE buyer_installment_id = NEW.installment_id;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.client_payment_schedule AS schedule
SET transaction_refs = coalesce((
  SELECT array_agg(payment.transaction_ref ORDER BY payment.created_at)
  FROM public.buyer_payments AS payment
  WHERE payment.installment_id = schedule.buyer_installment_id
), '{}'::text[])
WHERE schedule.buyer_installment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.lookup_buyer_payment(p_transaction_ref text)
RETURNS TABLE (
  transaction_ref text,
  received_date date,
  posted_at timestamptz,
  amount numeric,
  currency text,
  payment_method text,
  external_reference text,
  unit_number text,
  buyer_display text,
  installment_number integer,
  scheduled_due_date date,
  posted_by text,
  record_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT payment.transaction_ref,
    payment.payment_date,
    payment.created_at,
    payment.amount,
    'KES'::text,
    payment.method,
    payment.reference,
    sale.unit_number,
    CASE WHEN coalesce(sale.buyer_name, '') = '' THEN 'NBG client' ELSE left(btrim(sale.buyer_name), 1) || '•••' END,
    installment.installment_number,
    installment.due_date,
    coalesce(nullif(profile.full_name, ''), 'NBG authorized staff'),
    CASE WHEN installment.due_date > payment.payment_date THEN 'ADVANCE PAYMENT' ELSE 'RECORDED' END
  FROM public.buyer_payments AS payment
  JOIN public.sales AS sale ON sale.id = payment.sale_id
  LEFT JOIN public.buyer_installments AS installment ON installment.id = payment.installment_id
  LEFT JOIN public.profiles AS profile ON profile.id = payment.recorded_by
  WHERE upper(payment.transaction_ref) = upper(btrim(p_transaction_ref))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_buyer_payment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_buyer_payment(text) TO anon, authenticated;

ALTER TABLE public.buyer_payments ENABLE TRIGGER guard_buyer_payment_recording;

REVOKE UPDATE, DELETE ON public.buyer_payments FROM authenticated;
DROP POLICY IF EXISTS "role_update_buyer_payments" ON public.buyer_payments;
DROP POLICY IF EXISTS "admin_delete_buyer_payments" ON public.buyer_payments;

NOTIFY pgrst, 'reload schema';
