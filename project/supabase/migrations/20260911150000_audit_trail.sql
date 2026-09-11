/*
# Categorised audit trail

Logs every insert, update, and delete across the operational tables. The trigger
captures the authenticated actor, action category, record identity, and old/new
row snapshots for a complete review history.
*/

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  category text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_audit_logs" ON public.audit_logs;
CREATE POLICY "authenticated_select_audit_logs" ON public.audit_logs FOR SELECT
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON public.audit_logs (category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.record_audit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  row_data jsonb;
  previous_data jsonb;
  record_id uuid;
  record_label text;
BEGIN
  row_data := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  previous_data := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  record_id := COALESCE((row_data ->> 'id')::uuid, (previous_data ->> 'id')::uuid);
  record_label := COALESCE(
    row_data ->> 'name', row_data ->> 'title', row_data ->> 'unit_number', row_data ->> 'investor_name',
    previous_data ->> 'name', previous_data ->> 'title', previous_data ->> 'unit_number', previous_data ->> 'investor_name'
  );

  INSERT INTO public.audit_logs (actor_id, actor_email, category, action, entity_type, entity_id, entity_label, old_data, new_data)
  VALUES (
    auth.uid(),
    coalesce(auth.jwt() ->> 'email', 'anonymous'),
    upper(TG_TABLE_NAME),
    TG_OP,
    TG_TABLE_NAME,
    record_id,
    record_label,
    previous_data,
    row_data
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['leads', 'sales', 'project_units', 'projects', 'construction_updates', 'investments', 'realtors', 'commissions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.record_audit_change()', table_name, table_name);
  END LOOP;
END $$;
