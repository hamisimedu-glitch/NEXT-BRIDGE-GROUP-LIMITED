-- Persist normalized metadata for production construction and finance documents.
-- Run this migration in Supabase SQL Editor after the existing client document migrations.
ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS vendor_name text,
  ADD COLUMN IF NOT EXISTS vendor_tax_number text,
  ADD COLUMN IF NOT EXISTS vendor_address text,
  ADD COLUMN IF NOT EXISTS purchase_order_number text,
  ADD COLUMN IF NOT EXISTS tax_invoice_number text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_branch text,
  ADD COLUMN IF NOT EXISTS bank_account_reference text,
  ADD COLUMN IF NOT EXISTS amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS tax_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'KES',
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS issue_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS authorized_by text,
  ADD COLUMN IF NOT EXISTS prepared_by text,
  ADD COLUMN IF NOT EXISTS notes text;

UPDATE public.client_documents
SET document_number = COALESCE(document_number, document_ref),
    document_type = COALESCE(document_type, category),
    issue_date = COALESCE(issue_date, generated_at::date, created_at::date)
WHERE document_number IS NULL OR document_type IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_documents_document_number
  ON public.client_documents(document_number)
  WHERE document_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_documents_document_type
  ON public.client_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_client_documents_vendor
  ON public.client_documents(vendor_name);
CREATE INDEX IF NOT EXISTS idx_client_documents_due_date
  ON public.client_documents(due_date)
  WHERE due_date IS NOT NULL;

COMMENT ON COLUMN public.client_documents.document_number IS 'Automatic NBG-issued number; normally equal to document_ref for generated PDFs.';
COMMENT ON COLUMN public.client_documents.document_type IS 'Controlled business document type, for example QUOTATION or SUPPLIER_INVOICE.';
COMMENT ON COLUMN public.client_documents.content_summary IS 'Immutable human-readable snapshot of the type-specific document contents used to generate the PDF.';
