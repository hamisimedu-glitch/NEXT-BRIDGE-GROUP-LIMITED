/*
# Role-based dashboard access control

Roles:
- owner/admin: full management and audit access
- staff: operational records, no destructive deletes or audit access

This replaces the previous authenticated-only policies with role-aware policies.
*/

CREATE OR REPLACE FUNCTION public.has_dashboard_role(allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = ANY(allowed_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_dashboard_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_dashboard_role(ARRAY['owner', 'admin']); $$;

CREATE OR REPLACE FUNCTION public.is_dashboard_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_dashboard_role(ARRAY['owner', 'admin', 'staff']); $$;

-- Rebuild policies for operational tables.
DO $$
DECLARE
  table_name text;
  policy_record record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['leads', 'sales', 'project_units', 'projects', 'construction_updates', 'investments', 'realtors', 'commissions'] LOOP
    FOR policy_record IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, table_name);
    END LOOP;

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_dashboard_staff())', 'role_select_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_staff())', 'role_insert_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_dashboard_staff()) WITH CHECK (public.is_dashboard_staff())', 'role_update_' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_dashboard_admin())', 'admin_delete_' || table_name, table_name);
  END LOOP;
END $$;

-- Public forms remain allowed to create leads and investment inquiries.
CREATE POLICY "public_insert_leads" ON public.leads FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public_insert_investments" ON public.investments FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "public_select_published_projects" ON public.projects FOR SELECT
  TO anon USING (is_published = true);
CREATE POLICY "public_select_published_units" ON public.project_units FOR SELECT
  TO anon USING (is_published = true);

-- Audit history is owner/admin only and cannot be edited from the client.
DROP POLICY IF EXISTS "authenticated_select_audit_logs" ON public.audit_logs;
CREATE POLICY "admin_select_audit_logs" ON public.audit_logs FOR SELECT
  TO authenticated USING (public.is_dashboard_admin());

-- Storage is available to staff for uploads, but only admins may delete media.
DROP POLICY IF EXISTS "authenticated_upload_public_media" ON storage.objects;
CREATE POLICY "role_upload_public_media" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'public-media' AND public.is_dashboard_staff());

DROP POLICY IF EXISTS "authenticated_update_public_media" ON storage.objects;
CREATE POLICY "role_update_public_media" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'public-media' AND public.is_dashboard_staff())
  WITH CHECK (bucket_id = 'public-media' AND public.is_dashboard_staff());

DROP POLICY IF EXISTS "authenticated_delete_public_media" ON storage.objects;
CREATE POLICY "admin_delete_public_media" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'public-media' AND public.is_dashboard_admin());
