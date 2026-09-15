-- Link investment enquiries to the authenticated client who created them.
ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS investor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_investments_investor_user_id
  ON public.investments (investor_user_id);

DROP POLICY IF EXISTS "client_insert_own_investment_plans" ON public.investments;
CREATE POLICY "client_insert_own_investment_plans" ON public.investments
  FOR INSERT TO authenticated
  WITH CHECK (investor_user_id = auth.uid());

DROP POLICY IF EXISTS "client_select_own_investment_plans" ON public.investments;
CREATE POLICY "client_select_own_investment_plans" ON public.investments
  FOR SELECT TO authenticated
  USING (investor_user_id = auth.uid() OR public.is_dashboard_staff());
