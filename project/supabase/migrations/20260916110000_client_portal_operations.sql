-- Client-owned portal operations: milestones, documents, payment plans, support, and notifications.
CREATE TABLE IF NOT EXISTS public.client_reservation_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.project_units(id) ON DELETE SET NULL,
  stage text NOT NULL CHECK (stage IN ('ENQUIRY', 'VIEWING', 'RESERVATION', 'DEPOSIT', 'AGREEMENT', 'HANDOVER')),
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.project_units(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'OTHER',
  file_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_payment_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.project_units(id) ON DELETE SET NULL,
  description text NOT NULL,
  due_date date NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PAID', 'PENDING', 'OVERDUE', 'PARTIAL')),
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  staff_reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'GENERAL',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['client_reservation_stages', 'client_documents', 'client_payment_schedule', 'client_support_tickets', 'client_notifications'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_select_own', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_dashboard_staff())', table_name || '_select_own', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_insert_own', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.is_dashboard_staff())', table_name || '_insert_own', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_update_own', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_dashboard_staff()) WITH CHECK (user_id = auth.uid() OR public.is_dashboard_staff())', table_name || '_update_own', table_name);
  END LOOP;
END $$;

-- Only staff may create operational records; clients may submit support tickets.
DROP POLICY IF EXISTS "client_reservation_stages_insert_own" ON public.client_reservation_stages;
CREATE POLICY "client_reservation_stages_insert_staff" ON public.client_reservation_stages
  FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS "client_documents_insert_own" ON public.client_documents;
CREATE POLICY "client_documents_insert_staff" ON public.client_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS "client_payment_schedule_insert_own" ON public.client_payment_schedule;
CREATE POLICY "client_payment_schedule_insert_staff" ON public.client_payment_schedule
  FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS "client_notifications_insert_own" ON public.client_notifications;
CREATE POLICY "client_notifications_insert_staff" ON public.client_notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_staff());

DROP POLICY IF EXISTS "client_reservation_stages_update_own" ON public.client_reservation_stages;
CREATE POLICY "client_reservation_stages_update_staff" ON public.client_reservation_stages
  FOR UPDATE TO authenticated USING (public.is_dashboard_staff()) WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS "client_documents_update_own" ON public.client_documents;
CREATE POLICY "client_documents_update_staff" ON public.client_documents
  FOR UPDATE TO authenticated USING (public.is_dashboard_staff()) WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS "client_payment_schedule_update_own" ON public.client_payment_schedule;
CREATE POLICY "client_payment_schedule_update_staff" ON public.client_payment_schedule
  FOR UPDATE TO authenticated USING (public.is_dashboard_staff()) WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS "client_notifications_update_own" ON public.client_notifications;
CREATE POLICY "client_notifications_update_read" ON public.client_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_dashboard_staff()) WITH CHECK (user_id = auth.uid() OR public.is_dashboard_staff());

CREATE INDEX IF NOT EXISTS idx_client_stages_user ON public.client_reservation_stages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_documents_user ON public.client_documents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_payments_user_due ON public.client_payment_schedule(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_client_tickets_user ON public.client_support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_notifications_user ON public.client_notifications(user_id, created_at DESC);
