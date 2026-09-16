-- Relational activity timeline for lead/client follow-up actions.
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL DEFAULT 'NOTE',
  channel text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_select_lead_activities" ON public.lead_activities;
CREATE POLICY "staff_select_lead_activities" ON public.lead_activities FOR SELECT TO authenticated USING (public.is_dashboard_staff());
DROP POLICY IF EXISTS "staff_insert_lead_activities" ON public.lead_activities;
CREATE POLICY "staff_insert_lead_activities" ON public.lead_activities FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_staff());
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_created ON public.lead_activities(lead_id, created_at DESC);

DROP POLICY IF EXISTS "staff_delete_client_documents" ON public.client_documents;
CREATE POLICY "staff_delete_client_documents" ON public.client_documents FOR DELETE TO authenticated USING (public.is_dashboard_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "staff_upload_client_documents" ON storage.objects;
CREATE POLICY "staff_upload_client_documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'client-documents' AND public.is_dashboard_staff());
DROP POLICY IF EXISTS "staff_manage_client_documents" ON storage.objects;
CREATE POLICY "staff_manage_client_documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'client-documents' AND public.is_dashboard_admin());
