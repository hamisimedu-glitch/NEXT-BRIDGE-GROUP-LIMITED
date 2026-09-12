/*
# Buyer installment payments

Adds payment-plan metadata to sales, a scheduled installment table, and payment
receipts. Amounts are recorded in KES and all financial mutations are audited.
*/

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS deposit_amount numeric(12,2) DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS installment_count integer DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS installment_frequency text DEFAULT 'MONTHLY';

CREATE TABLE IF NOT EXISTS public.buyer_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  due_date date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status text NOT NULL DEFAULT 'PENDING',
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sale_id, installment_number)
);

CREATE TABLE IF NOT EXISTS public.buyer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  installment_id uuid REFERENCES public.buyer_installments(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT current_date,
  method text NOT NULL DEFAULT 'BANK_TRANSFER',
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.buyer_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_select_buyer_installments" ON public.buyer_installments;
CREATE POLICY "role_select_buyer_installments" ON public.buyer_installments FOR SELECT TO authenticated USING (public.is_dashboard_staff());
DROP POLICY IF EXISTS "role_insert_buyer_installments" ON public.buyer_installments;
CREATE POLICY "role_insert_buyer_installments" ON public.buyer_installments FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS "role_update_buyer_installments" ON public.buyer_installments;
CREATE POLICY "role_update_buyer_installments" ON public.buyer_installments FOR UPDATE TO authenticated USING (public.is_dashboard_staff()) WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS "admin_delete_buyer_installments" ON public.buyer_installments;
CREATE POLICY "admin_delete_buyer_installments" ON public.buyer_installments FOR DELETE TO authenticated USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS "role_select_buyer_payments" ON public.buyer_payments;
CREATE POLICY "role_select_buyer_payments" ON public.buyer_payments FOR SELECT TO authenticated USING (public.is_dashboard_staff());
DROP POLICY IF EXISTS "role_insert_buyer_payments" ON public.buyer_payments;
CREATE POLICY "role_insert_buyer_payments" ON public.buyer_payments FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS "role_update_buyer_payments" ON public.buyer_payments;
CREATE POLICY "role_update_buyer_payments" ON public.buyer_payments FOR UPDATE TO authenticated USING (public.is_dashboard_staff()) WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS "admin_delete_buyer_payments" ON public.buyer_payments;
CREATE POLICY "admin_delete_buyer_payments" ON public.buyer_payments FOR DELETE TO authenticated USING (public.is_dashboard_admin());

CREATE INDEX IF NOT EXISTS idx_buyer_installments_sale_id ON public.buyer_installments (sale_id);
CREATE INDEX IF NOT EXISTS idx_buyer_installments_due_date ON public.buyer_installments (due_date);
CREATE INDEX IF NOT EXISTS idx_buyer_payments_sale_id ON public.buyer_payments (sale_id);

CREATE OR REPLACE FUNCTION public.refresh_installment_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.buyer_installments
     SET paid_amount = paid_amount + NEW.amount,
         paid_at = CASE WHEN paid_amount + NEW.amount >= amount THEN coalesce(paid_at, now()) ELSE paid_at END,
         status = CASE WHEN paid_amount + NEW.amount >= amount THEN 'PAID' WHEN paid_amount + NEW.amount > 0 THEN 'PARTIAL' ELSE status END
   WHERE id = NEW.installment_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_installment_status_after_payment ON public.buyer_payments;
CREATE TRIGGER refresh_installment_status_after_payment AFTER INSERT ON public.buyer_payments FOR EACH ROW EXECUTE FUNCTION public.refresh_installment_status();

DROP TRIGGER IF EXISTS audit_buyer_installments ON public.buyer_installments;
CREATE TRIGGER audit_buyer_installments AFTER INSERT OR UPDATE OR DELETE ON public.buyer_installments FOR EACH ROW EXECUTE FUNCTION public.record_audit_change();
DROP TRIGGER IF EXISTS audit_buyer_payments ON public.buyer_payments;
CREATE TRIGGER audit_buyer_payments AFTER INSERT OR UPDATE OR DELETE ON public.buyer_payments FOR EACH ROW EXECUTE FUNCTION public.record_audit_change();
