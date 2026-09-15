-- Allow public visitors to track only updates belonging to published projects.
DROP POLICY IF EXISTS "public_select_published_construction_updates" ON public.construction_updates;
CREATE POLICY "public_select_published_construction_updates" ON public.construction_updates
  FOR SELECT
  TO anon
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.projects
      WHERE public.projects.id = construction_updates.project_id
        AND public.projects.is_published = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_updates_project_posted_at
  ON public.construction_updates (project_id, posted_at DESC);
