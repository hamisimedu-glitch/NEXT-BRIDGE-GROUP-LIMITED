DO $$
DECLARE
  table_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;

  FOREACH table_name IN ARRAY ARRAY['client_documents', 'project_investment_documents', 'client_support_tickets'] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables AS publication_table
        WHERE publication_table.pubname = 'supabase_realtime'
          AND publication_table.schemaname = 'public'
          AND publication_table.tablename = table_name
      ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;