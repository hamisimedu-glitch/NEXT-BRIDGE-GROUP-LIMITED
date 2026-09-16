-- Allow authenticated staff and clients to create signed URLs for private document records.
-- Database RLS on public.client_documents controls which records each user can see.
DROP POLICY IF EXISTS "authenticated_read_client_documents" ON storage.objects;
CREATE POLICY "authenticated_read_client_documents"
ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'client-documents');
