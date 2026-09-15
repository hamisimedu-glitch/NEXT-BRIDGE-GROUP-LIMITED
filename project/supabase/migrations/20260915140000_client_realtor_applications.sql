-- Link realtor applications to the authenticated client who submitted them.
ALTER TABLE public.realtors
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_realtors_user_id ON public.realtors (user_id);

DROP POLICY IF EXISTS "client_insert_own_realtor_application" ON public.realtors;
CREATE POLICY "client_insert_own_realtor_application" ON public.realtors
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "client_select_own_realtor_application" ON public.realtors;
CREATE POLICY "client_select_own_realtor_application" ON public.realtors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_dashboard_staff());
