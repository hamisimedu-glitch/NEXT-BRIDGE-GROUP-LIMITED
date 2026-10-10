DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_documents'
      AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.client_documents', policy_row.policyname);
  END LOOP;
END;
$$;

CREATE POLICY client_documents_select_scoped
ON public.client_documents
FOR SELECT TO authenticated
USING (is_global = true OR user_id = auth.uid() OR public.is_dashboard_staff());

DROP POLICY IF EXISTS authenticated_read_client_documents ON storage.objects;
DROP POLICY IF EXISTS client_documents_read_assigned ON storage.objects;
CREATE POLICY client_documents_read_assigned
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'client-documents'
  AND (
    public.is_dashboard_staff()
    OR EXISTS (
      SELECT 1
      FROM public.client_documents AS document
      WHERE document.file_url = storage.objects.name
        AND (document.is_global = true OR document.user_id = auth.uid())
    )
  )
);