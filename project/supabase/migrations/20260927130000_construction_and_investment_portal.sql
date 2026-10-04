ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS total_floors integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_total_floors_range'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_total_floors_range
      CHECK (total_floors IS NULL OR total_floors BETWEEN 1 AND 250);
  END IF;
END $$;

ALTER TABLE public.construction_updates
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "public_select_published_construction_updates" ON public.construction_updates;
CREATE POLICY "public_select_published_construction_updates" ON public.construction_updates
  FOR SELECT TO anon
  USING (
    is_published = true
    AND (project_id IS NULL OR EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = construction_updates.project_id
        AND public.projects.is_published = true
    ))
  );

DROP POLICY IF EXISTS "client_select_published_construction_updates" ON public.construction_updates;
CREATE POLICY "client_select_published_construction_updates" ON public.construction_updates
  FOR SELECT TO authenticated
  USING (
    public.is_dashboard_staff()
    OR (is_published = true AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects
        WHERE public.projects.id = construction_updates.project_id
          AND public.projects.is_published = true
      )
    ))
  );

CREATE TABLE IF NOT EXISTS public.project_construction_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  total_floors integer NOT NULL CHECK (total_floors BETWEEN 1 AND 250),
  draft_data jsonb NOT NULL CHECK (jsonb_typeof(draft_data) = 'object'),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.published_construction_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  total_floors integer NOT NULL CHECK (total_floors BETWEEN 1 AND 250),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_construction_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.published_construction_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "construction_plans_staff_select" ON public.project_construction_plans;
CREATE POLICY "construction_plans_staff_select" ON public.project_construction_plans
  FOR SELECT TO authenticated USING (public.is_dashboard_staff());
DROP POLICY IF EXISTS "construction_plans_staff_insert" ON public.project_construction_plans;
CREATE POLICY "construction_plans_staff_insert" ON public.project_construction_plans
  FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_admin());
DROP POLICY IF EXISTS "construction_plans_staff_update" ON public.project_construction_plans;
CREATE POLICY "construction_plans_staff_update" ON public.project_construction_plans
  FOR UPDATE TO authenticated USING (public.is_dashboard_admin()) WITH CHECK (public.is_dashboard_admin());
DROP POLICY IF EXISTS "construction_plans_admin_delete" ON public.project_construction_plans;
CREATE POLICY "construction_plans_admin_delete" ON public.project_construction_plans
  FOR DELETE TO authenticated USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS "published_progress_public_select" ON public.published_construction_progress;
CREATE POLICY "published_progress_public_select" ON public.published_construction_progress
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE public.projects.id = published_construction_progress.project_id
      AND public.projects.is_published = true
  ));
DROP POLICY IF EXISTS "published_progress_staff_select" ON public.published_construction_progress;
CREATE POLICY "published_progress_staff_select" ON public.published_construction_progress
  FOR SELECT TO authenticated USING (public.is_dashboard_staff());

CREATE OR REPLACE FUNCTION public.publish_construction_progress(p_project_id uuid)
RETURNS public.published_construction_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan_row public.project_construction_plans%ROWTYPE;
  published_row public.published_construction_progress%ROWTYPE;
BEGIN
  IF NOT public.is_dashboard_admin() THEN
    RAISE EXCEPTION 'Admin access required to publish construction progress' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO plan_row
  FROM public.project_construction_plans
  WHERE project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Save a construction draft before publishing';
  END IF;

  INSERT INTO public.published_construction_progress (project_id, total_floors, data, published_at, updated_at)
  VALUES (plan_row.project_id, plan_row.total_floors, plan_row.draft_data, now(), now())
  ON CONFLICT (project_id) DO UPDATE
    SET total_floors = EXCLUDED.total_floors,
        data = EXCLUDED.data,
        published_at = EXCLUDED.published_at,
        updated_at = EXCLUDED.updated_at
  RETURNING * INTO published_row;

  RETURN published_row;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_construction_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_construction_progress(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_construction_plan_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_construction_plan_updated_at ON public.project_construction_plans;
CREATE TRIGGER touch_construction_plan_updated_at
  BEFORE UPDATE ON public.project_construction_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_construction_plan_updated_at();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['project_construction_plans', 'published_construction_progress'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.record_audit_change()', table_name, table_name);
  END LOOP;
END $$;

ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS investment_range text,
  ADD COLUMN IF NOT EXISTS investment_structure text,
  ADD COLUMN IF NOT EXISTS investor_message text,
  ADD COLUMN IF NOT EXISTS consent_to_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS investor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount_committed numeric(14,2) CHECK (amount_committed IS NULL OR amount_committed >= 0);

DROP POLICY IF EXISTS "public_insert_investments" ON public.investments;
CREATE POLICY "public_insert_investments" ON public.investments
  FOR INSERT TO anon
  WITH CHECK (
    consent_to_contact = true
    AND consent_at IS NOT NULL
    AND length(btrim(investor_name)) BETWEEN 2 AND 160
    AND (investor_email IS NOT NULL OR investor_phone IS NOT NULL)
    AND (investor_email IS NULL OR length(btrim(investor_email)) <= 254)
    AND (investor_phone IS NULL OR length(btrim(investor_phone)) <= 40)
    AND coalesce(length(investment_range), 0) <= 80
    AND coalesce(length(investment_structure), 0) <= 100
    AND coalesce(length(investor_message), 0) <= 2000
    AND amount_interested IS NULL
    AND amount_committed IS NULL
    AND investor_user_id IS NULL
    AND status = 'INQUIRY'
  );

CREATE INDEX IF NOT EXISTS idx_investments_project_created
  ON public.investments (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_investments_investor_user
  ON public.investments (investor_user_id)
  WHERE investor_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.project_investment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  investor_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  is_public boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT false,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (is_public OR investor_user_id IS NOT NULL OR NOT is_published)
);

ALTER TABLE public.project_investment_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "investment_documents_public_select" ON public.project_investment_documents;
CREATE POLICY "investment_documents_public_select" ON public.project_investment_documents
  FOR SELECT TO anon USING (
    is_public = true AND is_published = true
    AND EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND is_published = true)
  );
DROP POLICY IF EXISTS "investment_documents_authorized_select" ON public.project_investment_documents;
CREATE POLICY "investment_documents_authorized_select" ON public.project_investment_documents
  FOR SELECT TO authenticated USING (
    public.is_dashboard_admin()
    OR (is_public = true AND is_published = true AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = project_investment_documents.project_id
        AND public.projects.is_published = true
    ))
    OR (investor_user_id = auth.uid() AND is_published = true)
  );
DROP POLICY IF EXISTS "investment_documents_admin_insert" ON public.project_investment_documents;
CREATE POLICY "investment_documents_admin_insert" ON public.project_investment_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_admin());
DROP POLICY IF EXISTS "investment_documents_admin_update" ON public.project_investment_documents;
CREATE POLICY "investment_documents_admin_update" ON public.project_investment_documents
  FOR UPDATE TO authenticated USING (public.is_dashboard_admin()) WITH CHECK (public.is_dashboard_admin());
DROP POLICY IF EXISTS "investment_documents_admin_delete" ON public.project_investment_documents;
CREATE POLICY "investment_documents_admin_delete" ON public.project_investment_documents
  FOR DELETE TO authenticated USING (public.is_dashboard_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES ('investment-documents', 'investment-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "investment_document_storage_admin_insert" ON storage.objects;
CREATE POLICY "investment_document_storage_admin_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'investment-documents' AND public.is_dashboard_admin()
  );
DROP POLICY IF EXISTS "investment_document_storage_admin_update" ON storage.objects;
CREATE POLICY "investment_document_storage_admin_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'investment-documents' AND public.is_dashboard_admin()
  ) WITH CHECK (
    bucket_id = 'investment-documents' AND public.is_dashboard_admin()
  );
DROP POLICY IF EXISTS "investment_document_storage_delete" ON storage.objects;
CREATE POLICY "investment_document_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'investment-documents' AND public.is_dashboard_admin()
  );
DROP POLICY IF EXISTS "investment_document_storage_read" ON storage.objects;
CREATE POLICY "investment_document_storage_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (
    bucket_id = 'investment-documents' AND EXISTS (
      SELECT 1 FROM public.project_investment_documents AS document
      WHERE document.storage_path = storage.objects.name
        AND document.is_published = true
        AND (document.is_public = true OR document.investor_user_id = auth.uid() OR public.is_dashboard_admin())
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.published_construction_progress;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
