DROP POLICY IF EXISTS "published_progress_authenticated_public" ON public.published_construction_progress;
CREATE POLICY "published_progress_authenticated_public" ON public.published_construction_progress
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE public.projects.id = published_construction_progress.project_id
      AND public.projects.is_published = true
  ));

DROP TRIGGER IF EXISTS audit_project_investment_documents ON public.project_investment_documents;
CREATE TRIGGER audit_project_investment_documents
  AFTER INSERT OR UPDATE OR DELETE ON public.project_investment_documents
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_change();
