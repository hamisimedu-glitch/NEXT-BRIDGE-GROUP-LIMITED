-- NBG Document Engine
-- Run after the existing client_documents and audit migrations.
-- Reuses projects, project_units, profiles, sales, buyer_payments, and client_documents.

CREATE TABLE IF NOT EXISTS public.document_number_sequences (
  document_type text PRIMARY KEY,
  prefix text NOT NULL,
  current_number bigint NOT NULL DEFAULT 0,
  number_padding integer NOT NULL DEFAULT 5 CHECK (number_padding BETWEEN 3 AND 9),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.document_number_sequences (document_type, prefix) VALUES
  ('AGREEMENT', 'NBG-AFS'), ('RECEIPT', 'NBG-RCP'), ('QUOTATION', 'NBG-QTN'),
  ('PURCHASE_ORDER', 'NBG-PO'), ('SUPPLIER_INVOICE', 'NBG-INV'), ('PAYMENT_VOUCHER', 'NBG-PV'),
  ('DELIVERY_NOTE', 'NBG-MDN'), ('CONSTRUCTION_CONTRACT', 'NBG-CC'),
  ('BROCHURE', 'NBG-PBR'), ('FLOOR_PLAN', 'NBG-FP')
ON CONFLICT (document_type) DO NOTHING;

ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS signature_status text NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_document_id uuid REFERENCES public.client_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS form_data jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.client_documents
SET document_number = COALESCE(document_number, document_ref),
    document_type = COALESCE(document_type, category),
    created_by = COALESCE(created_by, generated_by),
    updated_at = COALESCE(generated_at, created_at)
WHERE document_number IS NULL OR document_type IS NULL OR created_by IS NULL;

CREATE TABLE IF NOT EXISTS public.document_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.client_documents(id) ON DELETE CASCADE,
  related_document_id uuid NOT NULL REFERENCES public.client_documents(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN ('REVISES', 'AMENDS', 'SUPPORTS', 'DERIVED_FROM', 'REQUIRES', 'MATCHES', 'FULFILLS', 'RELATED_TO')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, related_document_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS public.document_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.client_documents(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('CREATED', 'EDITED', 'VIEWED', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'REJECTED', 'SIGNED', 'DOWNLOADED', 'CANCELLED', 'TERMINATED', 'ARCHIVED')),
  from_status text,
  to_status text,
  comment text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.document_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.client_documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text,
  file_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

CREATE OR REPLACE FUNCTION public.next_document_number(document_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sequence_row public.document_number_sequences;
  next_value bigint;
  year_text text := to_char(current_date, 'YYYY');
BEGIN
  SELECT * INTO sequence_row FROM public.document_number_sequences WHERE document_type = upper(document_kind) AND enabled FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unsupported document type: %', document_kind; END IF;
  next_value := sequence_row.current_number + 1;
  UPDATE public.document_number_sequences SET current_number = next_value, updated_at = now() WHERE document_type = sequence_row.document_type;
  RETURN sequence_row.prefix || '-' || year_text || '-' || lpad(next_value::text, sequence_row.number_padding, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_document_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;

ALTER TABLE public.document_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_sequences_staff ON public.document_number_sequences;
CREATE POLICY document_sequences_staff ON public.document_number_sequences FOR SELECT TO authenticated USING (public.is_dashboard_staff());
DROP POLICY IF EXISTS document_relationships_staff ON public.document_relationships;
CREATE POLICY document_relationships_staff ON public.document_relationships FOR ALL TO authenticated USING (public.is_dashboard_staff()) WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS document_workflow_staff ON public.document_workflow_events;
CREATE POLICY document_workflow_staff ON public.document_workflow_events FOR SELECT TO authenticated USING (public.is_dashboard_staff());
CREATE POLICY document_workflow_insert_staff ON public.document_workflow_events FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_staff());
DROP POLICY IF EXISTS document_revisions_staff ON public.document_revisions;
CREATE POLICY document_revisions_staff ON public.document_revisions FOR SELECT TO authenticated USING (public.is_dashboard_staff());
CREATE POLICY document_revisions_insert_staff ON public.document_revisions FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_staff());

CREATE INDEX IF NOT EXISTS idx_document_relationships_document ON public.document_relationships(document_id);
CREATE INDEX IF NOT EXISTS idx_document_relationships_related ON public.document_relationships(related_document_id);
CREATE INDEX IF NOT EXISTS idx_document_workflow_document ON public.document_workflow_events(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_revisions_document ON public.document_revisions(document_id, version_number DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_documents_document_number_engine ON public.client_documents(document_number) WHERE document_number IS NOT NULL;

DROP TRIGGER IF EXISTS audit_client_documents ON public.client_documents;
CREATE TRIGGER audit_client_documents AFTER INSERT OR UPDATE OR DELETE ON public.client_documents FOR EACH ROW EXECUTE FUNCTION public.record_audit_change();
