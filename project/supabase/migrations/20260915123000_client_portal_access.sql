-- Give new Magic Link users a least-privilege client role.
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'client';

-- Authenticated clients may read the same published content as anonymous visitors.
DROP POLICY IF EXISTS "client_select_published_projects" ON public.projects;
CREATE POLICY "client_select_published_projects" ON public.projects
  FOR SELECT TO authenticated
  USING (is_published = true OR public.is_dashboard_staff());

DROP POLICY IF EXISTS "client_select_published_units" ON public.project_units;
CREATE POLICY "client_select_published_units" ON public.project_units
  FOR SELECT TO authenticated
  USING (is_published = true OR public.is_dashboard_staff());

DROP POLICY IF EXISTS "client_select_published_construction_updates" ON public.construction_updates;
CREATE POLICY "client_select_published_construction_updates" ON public.construction_updates
  FOR SELECT TO authenticated
  USING (
    public.is_dashboard_staff()
    OR project_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.projects
      WHERE public.projects.id = construction_updates.project_id
        AND public.projects.is_published = true
    )
  );
