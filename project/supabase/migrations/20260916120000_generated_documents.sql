-- Generated, verifiable PDF documents for clients and global portal content.
ALTER TABLE public.client_documents
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS document_ref text,
  ADD COLUMN IF NOT EXISTS verification_code text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'UPLOADED';

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_documents_ref ON public.client_documents(document_ref) WHERE document_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_documents_verification ON public.client_documents(verification_code) WHERE verification_code IS NOT NULL;

DROP POLICY IF EXISTS "client_documents_select_own" ON public.client_documents;
CREATE POLICY "client_documents_select_own" ON public.client_documents
  FOR SELECT TO authenticated USING (is_global = true OR user_id = auth.uid() OR public.is_dashboard_staff());
DROP POLICY IF EXISTS "client_documents_insert_staff" ON public.client_documents;
CREATE POLICY "client_documents_insert_staff" ON public.client_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS "client_documents_update_staff" ON public.client_documents;
CREATE POLICY "client_documents_update_staff" ON public.client_documents
  FOR UPDATE TO authenticated USING (public.is_dashboard_staff()) WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS "staff_delete_client_documents" ON public.client_documents;
CREATE POLICY "staff_delete_client_documents" ON public.client_documents
  FOR DELETE TO authenticated USING (public.is_dashboard_admin());

CREATE OR REPLACE FUNCTION public.verify_client_document(code text)
RETURNS TABLE (title text, category text, document_ref text, verification_code text, content_hash text, generated_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.title, d.category, d.document_ref, d.verification_code, d.content_hash, d.generated_at
  FROM public.client_documents d
  WHERE d.verification_code = code;
$$;

GRANT EXECUTE ON FUNCTION public.verify_client_document(text) TO anon, authenticated;
