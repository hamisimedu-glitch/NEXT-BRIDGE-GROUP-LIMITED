ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_dashboard_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_dashboard_role_check
  CHECK (role IN ('client', 'staff', 'admin', 'owner', 'hr', 'leads', 'finance', 'project_manager', 'it')) NOT VALID;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_dashboard_role_check;

CREATE OR REPLACE FUNCTION public.enforce_single_admin_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_email text;
BEGIN
  SELECT lower(btrim(email)) INTO account_email FROM auth.users WHERE id = NEW.id;
  IF account_email = 'hamisimedu@gmail.com' THEN
    NEW.role := 'admin';
  ELSIF NEW.role = 'admin' THEN
    NEW.role := 'client';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_dashboard_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_dashboard_role(ARRAY['owner', 'admin']); $$;

CREATE OR REPLACE FUNCTION public.can_manage_dashboard_roles()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_dashboard_role(ARRAY['owner', 'admin']); $$;

CREATE OR REPLACE FUNCTION public.can_access_staff_dashboard()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_dashboard_role(ARRAY['owner', 'admin', 'hr', 'leads', 'finance', 'project_manager', 'it']); $$;

CREATE OR REPLACE FUNCTION public.is_dashboard_client()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_dashboard_role(ARRAY['client']); $$;

CREATE OR REPLACE FUNCTION public.can_manage_leads()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_dashboard_role(ARRAY['owner', 'admin', 'leads']); $$;

CREATE OR REPLACE FUNCTION public.can_manage_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_dashboard_role(ARRAY['owner', 'admin', 'finance']); $$;

CREATE OR REPLACE FUNCTION public.can_manage_projects()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_dashboard_role(ARRAY['owner', 'admin', 'project_manager']); $$;

CREATE OR REPLACE FUNCTION public.can_access_hr_directory()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_dashboard_role(ARRAY['owner', 'admin', 'hr']); $$;

CREATE OR REPLACE FUNCTION public.can_access_lead_assignees()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_dashboard_role(ARRAY['owner', 'admin', 'leads']); $$;

CREATE TABLE IF NOT EXISTS public.dashboard_staff_directory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  assigned_role text NOT NULL,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_staff_directory_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dashboard_staff_directory_events_select ON public.dashboard_staff_directory_events;
CREATE POLICY dashboard_staff_directory_events_select ON public.dashboard_staff_directory_events
  FOR SELECT TO authenticated USING (public.can_access_hr_directory());
GRANT SELECT ON public.dashboard_staff_directory_events TO authenticated;

CREATE TABLE IF NOT EXISTS public.lead_assignee_directory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_assignee_directory_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_assignee_directory_events_select ON public.lead_assignee_directory_events;
CREATE POLICY lead_assignee_directory_events_select ON public.lead_assignee_directory_events
  FOR SELECT TO authenticated USING (public.can_access_lead_assignees());
GRANT SELECT ON public.lead_assignee_directory_events TO authenticated;

CREATE OR REPLACE FUNCTION public.record_dashboard_staff_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role <> 'client' THEN
      INSERT INTO public.dashboard_staff_directory_events (target_user_id, assigned_role, actor_user_id) VALUES (NEW.id, NEW.role, auth.uid());
    END IF;
    IF NEW.role IN ('admin', 'owner', 'hr', 'leads', 'finance', 'project_manager', 'it') THEN
      INSERT INTO public.lead_assignee_directory_events DEFAULT VALUES;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.full_name IS DISTINCT FROM OLD.full_name OR NEW.phone IS DISTINCT FROM OLD.phone THEN
    IF NEW.role <> 'client' OR OLD.role <> 'client' THEN
      INSERT INTO public.dashboard_staff_directory_events (target_user_id, assigned_role, actor_user_id) VALUES (NEW.id, NEW.role, auth.uid());
    END IF;
    IF NEW.role IN ('admin', 'owner', 'hr', 'leads', 'finance', 'project_manager', 'it') OR OLD.role IN ('admin', 'owner', 'hr', 'leads', 'finance', 'project_manager', 'it') THEN
      INSERT INTO public.lead_assignee_directory_events DEFAULT VALUES;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_dashboard_staff_role_change ON public.profiles;
CREATE TRIGGER record_dashboard_staff_role_change
  AFTER INSERT OR UPDATE OF role, full_name, phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.record_dashboard_staff_role_change();

CREATE OR REPLACE FUNCTION public.get_dashboard_staff_directory()
RETURNS TABLE (user_id uuid, full_name text, email text, phone text, role text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_hr_directory() THEN
    RAISE EXCEPTION 'Staff directory access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT profile.id, profile.full_name, account.email::text, profile.phone, profile.role, profile.created_at
  FROM public.profiles AS profile
  JOIN auth.users AS account ON account.id = profile.id
  WHERE profile.role <> 'client'
  ORDER BY profile.full_name NULLS LAST, account.email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_staff_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_staff_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_dashboard_role_candidates()
RETURNS TABLE (user_id uuid, full_name text, email text, phone text, role text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_dashboard_roles() THEN
    RAISE EXCEPTION 'Admin/Owner access is required to view role candidates' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT profile.id, profile.full_name, account.email::text, profile.phone, profile.role, profile.created_at
  FROM public.profiles AS profile JOIN auth.users AS account ON account.id = profile.id
  ORDER BY profile.full_name NULLS LAST, account.email;
END;
$$;
REVOKE ALL ON FUNCTION public.get_dashboard_role_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_role_candidates() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_lead_assignees()
RETURNS TABLE (user_id uuid, full_name text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_lead_assignees() THEN
    RAISE EXCEPTION 'Lead assignment access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT profile.id, profile.full_name, profile.role
    FROM public.profiles AS profile
    WHERE profile.role IN ('admin', 'owner', 'leads')
    ORDER BY profile.full_name NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.get_lead_assignees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lead_assignees() TO authenticated;

CREATE OR REPLACE FUNCTION public.search_client_profiles(p_query text)
RETURNS TABLE (user_id uuid, full_name text, phone text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_finance() THEN
    RAISE EXCEPTION 'Finance dashboard access required to search registered buyers' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_query, ''))) < 2 THEN RETURN; END IF;
  RETURN QUERY
  SELECT profile.id, profile.full_name, profile.phone, account.email::text
  FROM public.profiles AS profile
  JOIN auth.users AS account ON account.id = profile.id
  WHERE profile.role = 'client'
    AND (coalesce(profile.full_name, '') ILIKE '%' || btrim(p_query) || '%'
      OR coalesce(account.email, '') ILIKE '%' || btrim(p_query) || '%'
      OR coalesce(profile.phone, '') ILIKE '%' || btrim(p_query) || '%')
  ORDER BY profile.full_name NULLS LAST, account.email
  LIMIT 8;
END;
$$;
REVOKE ALL ON FUNCTION public.search_client_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_client_profiles(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_client_purchase_request_with_mode(
  p_unit_id uuid,
  p_deposit numeric,
  p_installment_count integer,
  p_frequency text,
  p_payment_mode text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE created_sale_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_dashboard_client() THEN
    RAISE EXCEPTION 'A client account is required to submit a purchase request' USING ERRCODE = '42501';
  END IF;
  PERFORM public.expire_unit_reservations(p_unit_id);
  created_sale_id := public.create_client_purchase_request_with_mode_v1(p_unit_id, p_deposit, p_installment_count, p_frequency, p_payment_mode);
  UPDATE public.buyer_installments AS installment
  SET due_date = (sale.reservation_expires_at AT TIME ZONE 'Africa/Nairobi')::date
  FROM public.sales AS sale
  WHERE sale.id = created_sale_id AND installment.sale_id = sale.id AND installment.installment_number = 1;
  UPDATE public.client_payment_schedule AS schedule
  SET due_date = installment.due_date
  FROM public.buyer_installments AS installment
  WHERE installment.sale_id = created_sale_id AND installment.installment_number = 1 AND schedule.buyer_installment_id = installment.id;
  RETURN created_sale_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_client_purchase_request_with_mode(uuid, numeric, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_client_purchase_request_with_mode(uuid, numeric, integer, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_client_purchase_request(uuid, numeric, integer, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_dashboard_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_email text;
  previous_role text;
  target_name text;
BEGIN
  IF NOT public.can_manage_dashboard_roles() THEN
    RAISE EXCEPTION 'Admin/Owner access is required to assign dashboard roles' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('client', 'staff', 'owner', 'hr', 'leads', 'finance', 'project_manager', 'it') THEN
    RAISE EXCEPTION 'Select a valid staff dashboard role' USING ERRCODE = '22023';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own dashboard role' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(account.email)), profile.role, profile.full_name
  INTO target_email, previous_role, target_name
  FROM auth.users AS account
  JOIN public.profiles AS profile ON profile.id = account.id
  WHERE profile.id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff profile was not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_email = 'hamisimedu@gmail.com' THEN
    RAISE EXCEPTION 'The primary Admin account cannot be reassigned' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
  IF previous_role IS DISTINCT FROM p_role THEN
    INSERT INTO public.audit_logs (actor_id, actor_email, category, action, entity_type, entity_id, entity_label, old_data, new_data)
    VALUES (auth.uid(), auth.jwt() ->> 'email', 'PROFILES', 'UPDATE', 'profiles', p_user_id, coalesce(target_name, target_email), jsonb_build_object('role', previous_role), jsonb_build_object('role', p_role));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_dashboard_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_dashboard_role(uuid, text) TO authenticated;

DROP POLICY IF EXISTS role_select_leads ON public.leads;
DROP POLICY IF EXISTS role_insert_leads ON public.leads;
DROP POLICY IF EXISTS role_update_leads ON public.leads;
DROP POLICY IF EXISTS admin_delete_leads ON public.leads;
CREATE POLICY department_leads_select ON public.leads FOR SELECT TO authenticated USING (public.can_manage_leads());
CREATE POLICY department_leads_insert ON public.leads FOR INSERT TO authenticated WITH CHECK (public.can_manage_leads());
CREATE POLICY department_leads_update ON public.leads FOR UPDATE TO authenticated USING (public.can_manage_leads()) WITH CHECK (public.can_manage_leads());
CREATE POLICY admin_delete_leads ON public.leads FOR DELETE TO authenticated USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS role_select_sales ON public.sales;
DROP POLICY IF EXISTS role_insert_sales ON public.sales;
DROP POLICY IF EXISTS role_update_sales ON public.sales;
DROP POLICY IF EXISTS admin_delete_sales ON public.sales;
CREATE POLICY department_finance_sales_select ON public.sales FOR SELECT TO authenticated USING (public.can_manage_finance());
CREATE POLICY department_finance_sales_insert ON public.sales FOR INSERT TO authenticated WITH CHECK (
  public.can_manage_finance() AND unit_id IS NULL AND status = 'RESERVED' AND buyer_user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.profiles AS profile WHERE profile.id = buyer_user_id AND profile.role = 'client')
);
CREATE POLICY department_finance_sales_update ON public.sales FOR UPDATE TO authenticated USING (public.can_manage_finance()) WITH CHECK (public.can_manage_finance());
CREATE POLICY admin_delete_sales ON public.sales FOR DELETE TO authenticated USING (public.is_dashboard_admin());
GRANT UPDATE (sale_date, notes) ON public.sales TO authenticated;

DROP POLICY IF EXISTS role_select_project_units ON public.project_units;
DROP POLICY IF EXISTS role_insert_project_units ON public.project_units;
DROP POLICY IF EXISTS role_update_project_units ON public.project_units;
DROP POLICY IF EXISTS admin_delete_project_units ON public.project_units;
CREATE POLICY department_project_units_select ON public.project_units FOR SELECT TO authenticated
  USING (public.can_manage_projects() OR public.can_manage_finance());
CREATE POLICY department_project_units_insert ON public.project_units FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_projects());
CREATE POLICY department_project_units_update ON public.project_units FOR UPDATE TO authenticated
  USING (public.can_manage_projects()) WITH CHECK (public.can_manage_projects());
CREATE POLICY admin_delete_project_units ON public.project_units FOR DELETE TO authenticated USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS role_select_projects ON public.projects;
DROP POLICY IF EXISTS role_insert_projects ON public.projects;
DROP POLICY IF EXISTS role_update_projects ON public.projects;
DROP POLICY IF EXISTS admin_delete_projects ON public.projects;
CREATE POLICY department_projects_select ON public.projects FOR SELECT TO authenticated
  USING (public.can_manage_projects() OR public.can_manage_finance() OR (public.can_manage_leads() AND is_published));
CREATE POLICY department_projects_insert ON public.projects FOR INSERT TO authenticated WITH CHECK (public.can_manage_projects());
CREATE POLICY department_projects_update ON public.projects FOR UPDATE TO authenticated USING (public.can_manage_projects()) WITH CHECK (public.can_manage_projects());
CREATE POLICY admin_delete_projects ON public.projects FOR DELETE TO authenticated USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS role_select_investments ON public.investments;
DROP POLICY IF EXISTS role_insert_investments ON public.investments;
DROP POLICY IF EXISTS role_update_investments ON public.investments;
DROP POLICY IF EXISTS admin_delete_investments ON public.investments;
CREATE POLICY department_finance_investments_select ON public.investments FOR SELECT TO authenticated USING (public.can_manage_finance());
CREATE POLICY department_finance_investments_insert ON public.investments FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance());
CREATE POLICY department_finance_investments_update ON public.investments FOR UPDATE TO authenticated USING (public.can_manage_finance()) WITH CHECK (public.can_manage_finance());
CREATE POLICY admin_delete_investments ON public.investments FOR DELETE TO authenticated USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS client_notifications_insert_staff ON public.client_notifications;
CREATE POLICY admin_client_notifications_insert ON public.client_notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_dashboard_admin());
CREATE POLICY finance_investment_notifications_insert ON public.client_notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_finance()
    AND kind = 'INVESTMENT_STATUS'
    AND EXISTS (SELECT 1 FROM public.investments AS investment WHERE investment.investor_user_id = user_id)
  );

CREATE OR REPLACE FUNCTION public.guard_investment_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_finance()
    AND (NEW.amount_committed IS DISTINCT FROM OLD.amount_committed
      OR NEW.investor_user_id IS DISTINCT FROM OLD.investor_user_id) THEN
    RAISE EXCEPTION 'Finance dashboard access required to update investor account links or committed amounts'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS role_select_commissions ON public.commissions;
DROP POLICY IF EXISTS role_insert_commissions ON public.commissions;
DROP POLICY IF EXISTS role_update_commissions ON public.commissions;
DROP POLICY IF EXISTS admin_delete_commissions ON public.commissions;
CREATE POLICY department_finance_commissions_select ON public.commissions FOR SELECT TO authenticated USING (public.can_manage_finance());
CREATE POLICY department_finance_commissions_insert ON public.commissions FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance());
CREATE POLICY department_finance_commissions_update ON public.commissions FOR UPDATE TO authenticated USING (public.can_manage_finance()) WITH CHECK (public.can_manage_finance());
CREATE POLICY admin_delete_commissions ON public.commissions FOR DELETE TO authenticated USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS role_select_realtors ON public.realtors;
DROP POLICY IF EXISTS role_insert_realtors ON public.realtors;
DROP POLICY IF EXISTS role_update_realtors ON public.realtors;
DROP POLICY IF EXISTS admin_delete_realtors ON public.realtors;
CREATE POLICY admin_select_realtors ON public.realtors FOR SELECT TO authenticated USING (public.is_dashboard_admin());
CREATE POLICY admin_insert_realtors ON public.realtors FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_admin());
CREATE POLICY admin_update_realtors ON public.realtors FOR UPDATE TO authenticated USING (public.is_dashboard_admin()) WITH CHECK (public.is_dashboard_admin());
CREATE POLICY admin_delete_realtors ON public.realtors FOR DELETE TO authenticated USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS role_select_buyer_installments ON public.buyer_installments;
DROP POLICY IF EXISTS role_insert_buyer_installments ON public.buyer_installments;
DROP POLICY IF EXISTS role_update_buyer_installments ON public.buyer_installments;
CREATE POLICY department_finance_installments_select ON public.buyer_installments FOR SELECT TO authenticated USING (public.can_manage_finance());
CREATE POLICY department_finance_installments_insert ON public.buyer_installments FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance());
CREATE POLICY department_finance_installments_update ON public.buyer_installments FOR UPDATE TO authenticated USING (public.can_manage_finance()) WITH CHECK (public.can_manage_finance());

DROP POLICY IF EXISTS role_select_buyer_payments ON public.buyer_payments;
DROP POLICY IF EXISTS role_insert_buyer_payments ON public.buyer_payments;
DROP POLICY IF EXISTS role_update_buyer_payments ON public.buyer_payments;
CREATE POLICY department_finance_payments_select ON public.buyer_payments FOR SELECT TO authenticated USING (public.can_manage_finance());
CREATE POLICY department_finance_payments_insert ON public.buyer_payments FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance());
CREATE POLICY department_finance_payments_update ON public.buyer_payments FOR UPDATE TO authenticated USING (public.can_manage_finance()) WITH CHECK (public.can_manage_finance());

DROP POLICY IF EXISTS investment_application_reviews_staff_read ON public.investment_application_reviews;
CREATE POLICY investment_application_reviews_finance_read ON public.investment_application_reviews
  FOR SELECT TO authenticated USING (public.can_manage_finance());

DROP POLICY IF EXISTS investment_transactions_admin_select ON public.investment_transactions;
DROP POLICY IF EXISTS investment_transactions_admin_insert ON public.investment_transactions;
DROP POLICY IF EXISTS investment_transactions_admin_update ON public.investment_transactions;
CREATE POLICY investment_transactions_finance_select ON public.investment_transactions FOR SELECT TO authenticated USING (public.can_manage_finance());
CREATE POLICY investment_transactions_finance_insert ON public.investment_transactions FOR INSERT TO authenticated WITH CHECK (public.can_manage_finance());
CREATE POLICY investment_transactions_finance_update ON public.investment_transactions FOR UPDATE TO authenticated USING (public.can_manage_finance()) WITH CHECK (public.can_manage_finance());
CREATE POLICY investment_transactions_admin_delete ON public.investment_transactions FOR DELETE TO authenticated USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS role_select_construction_updates ON public.construction_updates;
DROP POLICY IF EXISTS role_insert_construction_updates ON public.construction_updates;
DROP POLICY IF EXISTS role_update_construction_updates ON public.construction_updates;
DROP POLICY IF EXISTS admin_delete_construction_updates ON public.construction_updates;
CREATE POLICY department_projects_updates_select ON public.construction_updates FOR SELECT TO authenticated USING (public.can_manage_projects());
CREATE POLICY department_projects_updates_insert ON public.construction_updates FOR INSERT TO authenticated WITH CHECK (public.can_manage_projects());
CREATE POLICY department_projects_updates_update ON public.construction_updates FOR UPDATE TO authenticated USING (public.can_manage_projects()) WITH CHECK (public.can_manage_projects());
CREATE POLICY admin_delete_construction_updates ON public.construction_updates FOR DELETE TO authenticated USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS construction_plans_staff_select ON public.project_construction_plans;
DROP POLICY IF EXISTS construction_plans_staff_insert ON public.project_construction_plans;
DROP POLICY IF EXISTS construction_plans_staff_update ON public.project_construction_plans;
DROP POLICY IF EXISTS construction_plans_admin_delete ON public.project_construction_plans;
CREATE POLICY department_construction_plans_select ON public.project_construction_plans FOR SELECT TO authenticated USING (public.can_manage_projects());
CREATE POLICY department_construction_plans_insert ON public.project_construction_plans FOR INSERT TO authenticated WITH CHECK (public.can_manage_projects());
CREATE POLICY department_construction_plans_update ON public.project_construction_plans FOR UPDATE TO authenticated USING (public.can_manage_projects()) WITH CHECK (public.can_manage_projects());
CREATE POLICY admin_construction_plans_delete ON public.project_construction_plans FOR DELETE TO authenticated USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS published_progress_staff_select ON public.published_construction_progress;
CREATE POLICY department_published_progress_select ON public.published_construction_progress FOR SELECT TO authenticated USING (public.can_manage_projects());

CREATE OR REPLACE FUNCTION public.publish_construction_progress(p_project_id uuid)
RETURNS public.published_construction_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  plan_row public.project_construction_plans%ROWTYPE;
  published_row public.published_construction_progress%ROWTYPE;
BEGIN
  IF NOT public.can_manage_projects() THEN
    RAISE EXCEPTION 'Project Management access required to publish construction progress' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO plan_row FROM public.project_construction_plans WHERE project_id = p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Save a construction draft before publishing'; END IF;
  INSERT INTO public.published_construction_progress (project_id, total_floors, data, published_at, updated_at)
  VALUES (plan_row.project_id, plan_row.total_floors, plan_row.draft_data, now(), now())
  ON CONFLICT (project_id) DO UPDATE SET total_floors = EXCLUDED.total_floors, data = EXCLUDED.data, published_at = EXCLUDED.published_at, updated_at = EXCLUDED.updated_at
  RETURNING * INTO published_row;
  RETURN published_row;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_construction_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_construction_progress(uuid) TO authenticated;

DROP POLICY IF EXISTS role_upload_public_media ON storage.objects;
CREATE POLICY role_upload_public_media ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'public-media' AND public.can_manage_projects());
DROP POLICY IF EXISTS role_update_public_media ON storage.objects;
CREATE POLICY role_update_public_media ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'public-media' AND public.can_manage_projects())
  WITH CHECK (bucket_id = 'public-media' AND public.can_manage_projects());

CREATE TABLE IF NOT EXISTS public.it_system_events (
  id uuid PRIMARY KEY REFERENCES public.audit_logs(id) ON DELETE CASCADE,
  category text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  created_at timestamptz NOT NULL
);
ALTER TABLE public.it_system_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS it_system_events_select ON public.it_system_events;
CREATE POLICY it_system_events_select ON public.it_system_events FOR SELECT TO authenticated
  USING (public.is_dashboard_admin() OR public.has_dashboard_role(ARRAY['it']));
GRANT SELECT ON public.it_system_events TO authenticated;

CREATE OR REPLACE FUNCTION public.copy_audit_event_to_it_feed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.it_system_events (id, category, action, entity_type, created_at)
  VALUES (NEW.id, NEW.category, NEW.action, NEW.entity_type, NEW.created_at)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS copy_audit_event_to_it_feed ON public.audit_logs;
CREATE TRIGGER copy_audit_event_to_it_feed AFTER INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.copy_audit_event_to_it_feed();
INSERT INTO public.it_system_events (id, category, action, entity_type, created_at)
SELECT id, category, action, entity_type, created_at FROM public.audit_logs
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS admin_select_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS authenticated_select_audit_logs ON public.audit_logs;
CREATE POLICY admin_select_audit_logs ON public.audit_logs FOR SELECT TO authenticated USING (public.is_dashboard_admin());

DROP POLICY IF EXISTS role_select_lead_activities ON public.lead_activities;
DROP POLICY IF EXISTS staff_select_lead_activities ON public.lead_activities;
DROP POLICY IF EXISTS role_insert_lead_activities ON public.lead_activities;
DROP POLICY IF EXISTS staff_insert_lead_activities ON public.lead_activities;
CREATE POLICY department_leads_activities_select ON public.lead_activities FOR SELECT TO authenticated USING (public.can_manage_leads());
CREATE POLICY department_leads_activities_insert ON public.lead_activities FOR INSERT TO authenticated WITH CHECK (public.can_manage_leads());

DROP POLICY IF EXISTS lead_project_shares_select_own ON public.lead_project_shares;
DROP POLICY IF EXISTS lead_project_shares_manage_staff ON public.lead_project_shares;
CREATE POLICY lead_project_shares_select_scoped ON public.lead_project_shares FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_leads());
CREATE POLICY lead_project_shares_manage_leads ON public.lead_project_shares FOR ALL TO authenticated
  USING (public.can_manage_leads()) WITH CHECK (public.can_manage_leads());

CREATE OR REPLACE FUNCTION public.record_lead_activity(p_lead_id uuid, p_activity_type text, p_channel text, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE activity_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_leads() THEN
    RAISE EXCEPTION 'Leads dashboard access required to record activity' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = p_lead_id) THEN
    RAISE EXCEPTION 'Lead was not found' USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(length(btrim(p_body)), 0) = 0 THEN
    RAISE EXCEPTION 'Activity details cannot be empty' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.lead_activities (lead_id, actor_id, activity_type, channel, body)
  VALUES (p_lead_id, auth.uid(), coalesce(nullif(btrim(p_activity_type), ''), 'NOTE'), nullif(btrim(p_channel), ''), btrim(p_body))
  RETURNING id INTO activity_id;
  RETURN activity_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_lead_activity(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_lead_activity(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.share_lead_project_details(p_lead_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE selected_lead public.leads%ROWTYPE; matched_user_id uuid; details jsonb;
BEGIN
  IF NOT public.can_manage_leads() THEN
    RAISE EXCEPTION 'Leads dashboard access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO selected_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead was not found' USING ERRCODE = 'P0002'; END IF;
  IF p_project_id IS NULL THEN
    UPDATE public.leads SET action_project_id = NULL WHERE id = p_lead_id;
    DELETE FROM public.lead_project_shares WHERE lead_id = p_lead_id;
    DELETE FROM public.client_notifications WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) = lower(selected_lead.email)) AND kind = 'PROJECT_DETAILS_SHARED' AND body LIKE '%' || selected_lead.tracking_code || '%';
    RETURN true;
  END IF;
  details := public.public_project_details(p_project_id);
  IF details IS NULL THEN RAISE EXCEPTION 'Choose a published project before sharing its details' USING ERRCODE = '22023'; END IF;
  UPDATE public.leads SET action_project_id = p_project_id WHERE id = p_lead_id;
  SELECT id INTO matched_user_id FROM auth.users WHERE lower(email) = lower(selected_lead.email) LIMIT 1;
  IF matched_user_id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.lead_project_shares (lead_id, user_id, tracking_code, project_id, project_details)
  VALUES (p_lead_id, matched_user_id, selected_lead.tracking_code, p_project_id, details, now())
  ON CONFLICT (lead_id) DO UPDATE SET user_id = EXCLUDED.user_id, tracking_code = EXCLUDED.tracking_code, project_id = EXCLUDED.project_id, project_details = EXCLUDED.project_details, shared_at = EXCLUDED.shared_at;
  DELETE FROM public.client_notifications WHERE user_id = matched_user_id AND kind = 'PROJECT_DETAILS_SHARED' AND body LIKE '%' || selected_lead.tracking_code || '%';
  INSERT INTO public.client_notifications (user_id, title, body, kind)
  VALUES (matched_user_id, 'Project details are ready', 'NBG shared ' || coalesce(details ->> 'name', 'project details') || '. Tracking code: ' || selected_lead.tracking_code, 'PROJECT_DETAILS_SHARED');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.share_lead_project_details(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_lead_project_details(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_export_verification(
  p_verification_code text,
  p_title text,
  p_category text,
  p_document_ref text,
  p_content_hash text,
  p_purchase_sale_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE caller_is_staff boolean := public.can_access_staff_dashboard(); reserved_user uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT caller_is_staff AND p_category NOT IN ('CLIENT_PAYMENT_STATEMENT', 'CLIENT_PURCHASE_QUOTATION') THEN
    RAISE EXCEPTION 'Staff access required to register this export' USING ERRCODE = '42501';
  END IF;
  IF NOT caller_is_staff AND NOT public.is_dashboard_client() THEN RAISE EXCEPTION 'Client account required' USING ERRCODE = '42501'; END IF;
  IF p_category = 'CLIENT_PURCHASE_QUOTATION' AND NOT EXISTS (SELECT 1 FROM public.sales AS sale WHERE sale.id = p_purchase_sale_id AND sale.buyer_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Purchase quotation must belong to the signed-in buyer' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_verification_code), '') = '' OR coalesce(btrim(p_title), '') = '' OR coalesce(btrim(p_document_ref), '') = '' OR coalesce(btrim(p_content_hash), '') = '' THEN
    RAISE EXCEPTION 'Verification metadata is incomplete' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.export_code_reservations WHERE verification_code = upper(btrim(p_verification_code)) AND user_id = auth.uid() AND expires_at > now() RETURNING user_id INTO reserved_user;
  IF reserved_user IS NULL THEN RAISE EXCEPTION 'Verification code was not reserved by this account or has expired' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.verified_exports (verification_code, title, category, document_ref, content_hash, generated_by)
  VALUES (upper(btrim(p_verification_code)), btrim(p_title), upper(btrim(p_category)), upper(btrim(p_document_ref)), lower(btrim(p_content_hash)), auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.register_export_verification(text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_export_verification(text, text, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.advance_investment_application(p_investment_id uuid, p_status text, p_amount_committed numeric, p_decision_notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE application public.investments%ROWTYPE; clean_notes text := btrim(coalesce(p_decision_notes, ''));
BEGIN
  IF NOT public.can_manage_finance() THEN RAISE EXCEPTION 'Finance dashboard access required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO application FROM public.investments WHERE id = p_investment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Investor application not found' USING ERRCODE = '22023'; END IF;
  IF p_status NOT IN ('SOFT_COMMIT', 'COMMITTED', 'WITHDRAWN') THEN RAISE EXCEPTION 'Select a valid investor review stage' USING ERRCODE = '22023'; END IF;
  IF p_status = 'SOFT_COMMIT' THEN
    IF application.status <> 'INQUIRY' OR NOT public.investment_application_has_basis(application) THEN RAISE EXCEPTION 'Complete the investor application before review' USING ERRCODE = '22023'; END IF;
    PERFORM set_config('nbg.investment_status_rpc', 'on', true);
    UPDATE public.investments SET status = 'SOFT_COMMIT', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_investment_id;
  ELSIF p_status = 'COMMITTED' THEN
    IF application.status <> 'SOFT_COMMIT' THEN RAISE EXCEPTION 'Move the application to In review before committing it' USING ERRCODE = '22023'; END IF;
    IF NOT public.investment_application_has_basis(application) OR coalesce(p_amount_committed, 0) <= 0 OR length(clean_notes) < 12 THEN RAISE EXCEPTION 'Record a committed amount and review notes before committing' USING ERRCODE = '22023'; END IF;
    PERFORM set_config('nbg.investment_status_rpc', 'on', true);
    UPDATE public.investments SET status = 'COMMITTED', amount_committed = p_amount_committed WHERE id = p_investment_id;
  ELSE
    IF application.status <> 'SOFT_COMMIT' OR length(clean_notes) < 12 THEN RAISE EXCEPTION 'Record a withdrawal reason before withdrawing this application' USING ERRCODE = '22023'; END IF;
    PERFORM set_config('nbg.investment_status_rpc', 'on', true);
    UPDATE public.investments SET status = 'WITHDRAWN' WHERE id = p_investment_id;
  END IF;
  INSERT INTO public.investment_application_reviews (investment_id, from_status, to_status, decision_notes, amount_committed, actor_id, actor_email)
  VALUES (p_investment_id, application.status, p_status, clean_notes, CASE WHEN p_status = 'COMMITTED' THEN p_amount_committed END, auth.uid(), auth.jwt() ->> 'email');
END;
$$;
REVOKE ALL ON FUNCTION public.advance_investment_application(uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_investment_application(uuid, text, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_unit_for_client(
  p_unit_id uuid,
  p_buyer_user_id uuid,
  p_reservation_hours integer,
  p_reason text,
  p_initial_payment numeric,
  p_installment_count integer,
  p_frequency text
)
RETURNS TABLE (sale_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_unit public.project_units%ROWTYPE;
  buyer_name text;
  buyer_phone text;
  buyer_email text;
  unit_price numeric(14,2);
  generated_sale_id uuid;
  reservation_expiry timestamptz;
  first_installment_id uuid;
  remaining_balance numeric(14,2);
  installment_amount numeric(14,2);
  due_step interval;
  installment_index integer;
BEGIN
  IF NOT public.can_manage_finance() THEN
    RAISE EXCEPTION 'Finance dashboard access is required to record a unit reservation' USING ERRCODE = '42501';
  END IF;
  IF p_reservation_hours IS NULL OR p_reservation_hours < 1 OR p_reservation_hours > 168 THEN
    RAISE EXCEPTION 'Reservations must be between 1 and 168 hours' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 12 OR length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Enter a reservation reason between 12 and 500 characters' USING ERRCODE = '22023';
  END IF;
  IF p_installment_count IS NULL OR p_installment_count < 0 OR p_installment_count > 120
    OR upper(coalesce(p_frequency, '')) NOT IN ('MONTHLY', 'QUARTERLY', 'ANNUALLY') THEN
    RAISE EXCEPTION 'Select a valid installment count and frequency' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_buyer_user_id AND role = 'client') THEN
    RAISE EXCEPTION 'Select a registered client account for this reservation' USING ERRCODE = '22023';
  END IF;
  PERFORM public.expire_unit_reservations(p_unit_id);
  SELECT * INTO selected_unit FROM public.project_units WHERE id = p_unit_id AND is_published = true FOR UPDATE;
  IF NOT FOUND OR selected_unit.status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'This unit is not available to reserve' USING ERRCODE = '22023';
  END IF;
  SELECT profile.full_name, profile.phone, account.email::text INTO buyer_name, buyer_phone, buyer_email
  FROM public.profiles AS profile JOIN auth.users AS account ON account.id = profile.id WHERE profile.id = p_buyer_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The selected client account could not be loaded' USING ERRCODE = '22023'; END IF;
  SELECT financial.recorded_price INTO unit_price FROM public.unit_financials AS financial WHERE financial.unit_id = p_unit_id AND financial.recorded_price > 0;
  IF unit_price IS NULL AND regexp_replace(coalesce(selected_unit.price, ''), '[^0-9.]', '', 'g') ~ '^[0-9]+([.][0-9]{1,2})?$' THEN
    unit_price := regexp_replace(selected_unit.price, '[^0-9.]', '', 'g')::numeric;
  END IF;
  IF unit_price IS NULL OR unit_price <= 0 OR p_initial_payment IS NULL OR p_initial_payment <= 0 OR p_initial_payment > unit_price OR (p_initial_payment < unit_price AND p_installment_count < 1) THEN
    RAISE EXCEPTION 'Set a valid initial payment and installment plan for the confirmed unit price' USING ERRCODE = '22023';
  END IF;
  reservation_expiry := clock_timestamp() + make_interval(hours => p_reservation_hours);
  INSERT INTO public.sales (unit_id, unit_number, buyer_user_id, buyer_name, buyer_phone, buyer_email, sale_price, status, sale_date, deposit_amount, installment_count, installment_frequency, notes, reservation_expires_at, reservation_source, reservation_reason)
  VALUES (p_unit_id, selected_unit.unit_number, p_buyer_user_id, coalesce(nullif(btrim(buyer_name), ''), buyer_email), buyer_phone, buyer_email, unit_price, 'RESERVED', (now() AT TIME ZONE 'Africa/Nairobi')::date, 0, p_installment_count + 1, CASE WHEN p_initial_payment = unit_price THEN 'ONE_TIME' ELSE upper(p_frequency) END, 'Admin reservation; no payment has been recorded.', reservation_expiry, 'ADMIN', btrim(p_reason))
  RETURNING id INTO generated_sale_id;
  INSERT INTO public.buyer_installments (sale_id, installment_number, due_date, amount, status, notes)
  VALUES (generated_sale_id, 1, (reservation_expiry AT TIME ZONE 'Africa/Nairobi')::date, p_initial_payment, 'PENDING', 'Initial payment pending confirmation') RETURNING id INTO first_installment_id;
  INSERT INTO public.client_payment_schedule (user_id, project_id, unit_id, buyer_installment_id, description, due_date, amount, status, payment_reference)
  VALUES (p_buyer_user_id, selected_unit.project_id, p_unit_id, first_installment_id, 'Initial payment · Unit ' || selected_unit.unit_number, (reservation_expiry AT TIME ZONE 'Africa/Nairobi')::date, p_initial_payment, 'PENDING', 'NBG-PURCHASE-' || upper(replace(generated_sale_id::text, '-', '')));
  remaining_balance := unit_price - p_initial_payment;
  due_step := CASE upper(p_frequency) WHEN 'QUARTERLY' THEN interval '3 months' WHEN 'ANNUALLY' THEN interval '1 year' ELSE interval '1 month' END;
  IF p_installment_count > 0 AND remaining_balance > 0 THEN
    FOR installment_index IN 1..p_installment_count LOOP
      IF installment_index = p_installment_count THEN installment_amount := remaining_balance;
      ELSE installment_amount := round((unit_price - p_initial_payment) / p_installment_count, 2); remaining_balance := remaining_balance - installment_amount; END IF;
      INSERT INTO public.buyer_installments (sale_id, installment_number, due_date, amount, status)
      VALUES (generated_sale_id, installment_index + 1, ((now() AT TIME ZONE 'Africa/Nairobi')::date + due_step * installment_index)::date, installment_amount, 'PENDING') RETURNING id INTO first_installment_id;
      INSERT INTO public.client_payment_schedule (user_id, project_id, unit_id, buyer_installment_id, description, due_date, amount, status, payment_reference)
      VALUES (p_buyer_user_id, selected_unit.project_id, p_unit_id, first_installment_id, 'Installment ' || installment_index || ' · Unit ' || selected_unit.unit_number, ((now() AT TIME ZONE 'Africa/Nairobi')::date + due_step * installment_index)::date, installment_amount, 'PENDING', 'NBG-PURCHASE-' || upper(replace(generated_sale_id::text, '-', '')));
    END LOOP;
  END IF;
  INSERT INTO public.client_reservation_stages (user_id, project_id, unit_id, stage, notes)
  VALUES (p_buyer_user_id, selected_unit.project_id, p_unit_id, 'RESERVATION', 'NBG reserved this unit for you. Payment must be recorded before the reservation expires.'), (p_buyer_user_id, selected_unit.project_id, p_unit_id, 'DEPOSIT', 'The initial payment is scheduled and awaiting payment confirmation.');
  INSERT INTO public.client_notifications (user_id, title, body, kind)
  VALUES (p_buyer_user_id, 'Home reserved for you', format('Unit %s has been reserved for %s hours. Contact your NBG consultant to confirm the payment plan.', selected_unit.unit_number, p_reservation_hours), 'UNIT_RESERVED');
  RETURN QUERY SELECT generated_sale_id, reservation_expiry;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_unit_for_client(uuid, uuid, integer, text, numeric, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_unit_for_client(uuid, uuid, integer, text, numeric, integer, text) TO authenticated;

DO $$
DECLARE
  realtime_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH realtime_table IN ARRAY ARRAY['profiles', 'leads', 'sales', 'buyer_payments', 'buyer_installments', 'investments', 'projects', 'project_units', 'construction_updates', 'dashboard_staff_directory_events', 'lead_assignee_directory_events', 'it_system_events'] LOOP
      IF to_regclass(format('public.%I', realtime_table)) IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = realtime_table) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', realtime_table);
      END IF;
    END LOOP;
  END IF;
END;
$$;

DROP POLICY IF EXISTS dashboard_messages_read_thread ON public.dashboard_messages;
CREATE POLICY dashboard_messages_read_thread ON public.dashboard_messages FOR SELECT TO authenticated
  USING (public.is_dashboard_staff() OR (public.is_dashboard_client() AND client_id = auth.uid()));
DROP POLICY IF EXISTS dashboard_messages_send_thread ON public.dashboard_messages;
CREATE POLICY dashboard_messages_send_thread ON public.dashboard_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND ((public.is_dashboard_staff() AND sender_role = 'STAFF')
      OR (public.is_dashboard_client() AND sender_role = 'CLIENT' AND client_id = auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.mark_dashboard_messages_read(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_dashboard_staff() THEN
    UPDATE public.dashboard_messages SET read_at = now() WHERE client_id = p_client_id AND sender_role = 'CLIENT' AND read_at IS NULL;
  ELSIF public.is_dashboard_client() AND p_client_id = auth.uid() THEN
    UPDATE public.dashboard_messages SET read_at = now() WHERE client_id = auth.uid() AND sender_role = 'STAFF' AND read_at IS NULL;
  ELSE
    RAISE EXCEPTION 'You cannot mark this conversation as read' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_dashboard_messages_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_dashboard_messages_read(uuid) TO authenticated;