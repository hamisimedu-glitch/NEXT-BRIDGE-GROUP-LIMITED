-- Preserve generated document content for consistent admin and client previews.
ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS content_summary text;
