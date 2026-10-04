ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS amount_committed numeric(14,2) CHECK (amount_committed IS NULL OR amount_committed >= 0);

CREATE OR REPLACE FUNCTION public.guard_investment_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_dashboard_admin()
    AND (NEW.amount_committed IS DISTINCT FROM OLD.amount_committed
      OR NEW.investor_user_id IS DISTINCT FROM OLD.investor_user_id) THEN
    RAISE EXCEPTION 'Admin access required to update investor account links or committed amounts'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_investment_sensitive_fields ON public.investments;
CREATE TRIGGER guard_investment_sensitive_fields
  BEFORE UPDATE OF amount_committed, investor_user_id ON public.investments
  FOR EACH ROW EXECUTE FUNCTION public.guard_investment_sensitive_fields();

CREATE TABLE IF NOT EXISTS public.investment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id uuid NOT NULL REFERENCES public.investments(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('COMMITMENT', 'DEPOSIT', 'DISTRIBUTION', 'REPAYMENT', 'FEE', 'REFUND', 'OTHER')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'KES',
  transaction_date date NOT NULL DEFAULT current_date,
  reference text,
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "investment_transactions_admin_select" ON public.investment_transactions;
CREATE POLICY "investment_transactions_admin_select" ON public.investment_transactions
  FOR SELECT TO authenticated USING (public.is_dashboard_admin());
DROP POLICY IF EXISTS "investment_transactions_admin_insert" ON public.investment_transactions;
CREATE POLICY "investment_transactions_admin_insert" ON public.investment_transactions
  FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_admin());
DROP POLICY IF EXISTS "investment_transactions_admin_update" ON public.investment_transactions;
CREATE POLICY "investment_transactions_admin_update" ON public.investment_transactions
  FOR UPDATE TO authenticated USING (public.is_dashboard_admin()) WITH CHECK (public.is_dashboard_admin());
DROP POLICY IF EXISTS "investment_transactions_admin_delete" ON public.investment_transactions;
CREATE POLICY "investment_transactions_admin_delete" ON public.investment_transactions
  FOR DELETE TO authenticated USING (public.is_dashboard_admin());

CREATE INDEX IF NOT EXISTS idx_investment_transactions_investment_date
  ON public.investment_transactions (investment_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_investment_transactions_project_date
  ON public.investment_transactions (project_id, transaction_date DESC);

DROP TRIGGER IF EXISTS audit_investment_transactions ON public.investment_transactions;
CREATE TRIGGER audit_investment_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.investment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_change();
