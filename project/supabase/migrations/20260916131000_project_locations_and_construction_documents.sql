-- Portfolio expansion: structured locality, map coordinates, and construction document metadata.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS property_category text NOT NULL DEFAULT 'RESIDENTIAL',
  ADD COLUMN IF NOT EXISTS locality text,
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'Kenya',
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS map_zoom integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS land_reference text;

ALTER TABLE public.project_units
  ADD COLUMN IF NOT EXISTS property_category text NOT NULL DEFAULT 'APARTMENT',
  ADD COLUMN IF NOT EXISTS availability_note text;

ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS vendor_name text,
  ADD COLUMN IF NOT EXISTS purchase_order_number text,
  ADD COLUMN IF NOT EXISTS tax_invoice_number text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_reference text,
  ADD COLUMN IF NOT EXISTS amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'KES',
  ADD COLUMN IF NOT EXISTS due_date date;

CREATE INDEX IF NOT EXISTS idx_projects_locality ON public.projects(locality);
CREATE INDEX IF NOT EXISTS idx_projects_category ON public.projects(property_category);
CREATE INDEX IF NOT EXISTS idx_project_units_category ON public.project_units(property_category);
CREATE INDEX IF NOT EXISTS idx_client_documents_category ON public.client_documents(category);
CREATE INDEX IF NOT EXISTS idx_client_documents_project ON public.client_documents(project_id);

-- Keep all operational changes visible in the existing audit trail.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['client_documents'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.record_audit_change()', table_name, table_name);
  END LOOP;
END $$;
