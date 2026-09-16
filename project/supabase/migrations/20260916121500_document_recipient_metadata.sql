-- Preserve who a generated document was prepared for independently of profile display data.
ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS source_record_id uuid;
