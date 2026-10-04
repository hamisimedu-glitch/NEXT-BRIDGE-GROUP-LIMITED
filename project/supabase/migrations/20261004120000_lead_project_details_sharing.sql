ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS action_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.lead_project_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tracking_code text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_details jsonb NOT NULL,
  shared_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_project_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_project_shares_select_own" ON public.lead_project_shares;
CREATE POLICY "lead_project_shares_select_own" ON public.lead_project_shares
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_dashboard_staff());
DROP POLICY IF EXISTS "lead_project_shares_manage_staff" ON public.lead_project_shares;
CREATE POLICY "lead_project_shares_manage_staff" ON public.lead_project_shares
  FOR ALL TO authenticated USING (public.is_dashboard_staff()) WITH CHECK (public.is_dashboard_staff());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_project_shares TO authenticated;

CREATE OR REPLACE FUNCTION public.public_project_details(p_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', project.id,
    'name', project.name,
    'location', project.location,
    'locality', project.locality,
    'county', project.county,
    'country', project.country,
    'status', project.status,
    'description', project.description,
    'image_url', project.image_url,
    'price_min', project.price_min,
    'price_max', project.price_max,
    'amenities', project.amenities,
    'floor_plan_url', project.floor_plan_url,
    'brochure_url', project.brochure_url,
    'expected_completion', project.expected_completion,
    'investment_information', progress.data -> 'investment',
    'construction_progress', progress.data,
    'documents', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'title', document.title,
        'category', document.category,
        'storage_path', document.storage_path,
        'verification_code', document.verification_code,
        'document_ref', document.document_ref
      ) ORDER BY document.created_at DESC)
      FROM public.project_investment_documents AS document
      WHERE document.project_id = project.id
        AND document.is_public = true
        AND document.is_published = true
    ), '[]'::jsonb)
  )
  FROM public.projects AS project
  LEFT JOIN public.published_construction_progress AS progress ON progress.project_id = project.id
  WHERE project.id = p_project_id AND project.is_published = true;
$$;

REVOKE ALL ON FUNCTION public.public_project_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_project_details(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.share_lead_project_details(p_lead_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_lead public.leads%ROWTYPE;
  matched_user_id uuid;
  details jsonb;
BEGIN
  IF NOT public.is_dashboard_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO selected_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead was not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_project_id IS NULL THEN
    UPDATE public.leads SET action_project_id = NULL WHERE id = p_lead_id;
    DELETE FROM public.lead_project_shares WHERE lead_id = p_lead_id;
    DELETE FROM public.client_notifications
    WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) = lower(selected_lead.email))
      AND kind = 'PROJECT_DETAILS_SHARED'
      AND body LIKE '%' || selected_lead.tracking_code || '%';
    RETURN true;
  END IF;

  details := public.public_project_details(p_project_id);
  IF details IS NULL THEN
    RAISE EXCEPTION 'Choose a published project before sharing its details' USING ERRCODE = '22023';
  END IF;

  UPDATE public.leads SET action_project_id = p_project_id WHERE id = p_lead_id;

  SELECT profile.id INTO matched_user_id
  FROM public.profiles AS profile
  JOIN auth.users AS account ON account.id = profile.id
  WHERE lower(account.email) = lower(selected_lead.email)
    AND lower(profile.role) = 'client'
  LIMIT 1;

  IF matched_user_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.lead_project_shares (lead_id, user_id, tracking_code, project_id, project_details, shared_at)
  VALUES (p_lead_id, matched_user_id, selected_lead.tracking_code, p_project_id, details, now())
  ON CONFLICT (lead_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    tracking_code = EXCLUDED.tracking_code,
    project_id = EXCLUDED.project_id,
    project_details = EXCLUDED.project_details,
    shared_at = EXCLUDED.shared_at;

  DELETE FROM public.client_notifications
  WHERE user_id = matched_user_id
    AND kind = 'PROJECT_DETAILS_SHARED'
    AND body LIKE '%' || selected_lead.tracking_code || '%';
  INSERT INTO public.client_notifications (user_id, title, body, kind)
  VALUES (
    matched_user_id,
    'Project details are ready',
    'NBG shared ' || coalesce(details ->> 'name', 'project details') || '. Tracking code: ' || selected_lead.tracking_code,
    'PROJECT_DETAILS_SHARED'
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.share_lead_project_details(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_lead_project_details(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.track_public_enquiry(text);
CREATE FUNCTION public.track_public_enquiry(code text)
RETURNS TABLE (
  tracking_code text,
  request_type text,
  status text,
  submitted_at timestamptz,
  project_name text,
  project_details jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.tracking_code,
    CASE WHEN l.source = 'private-viewing' THEN 'PRIVATE_VIEWING' ELSE 'CONTACT_ENQUIRY' END,
    l.status,
    l.created_at,
    project.name,
    coalesce(share.project_details, public.public_project_details(l.action_project_id))
  FROM public.leads AS l
  LEFT JOIN public.projects AS project ON project.id = l.action_project_id AND project.is_published = true
  LEFT JOIN public.lead_project_shares AS share ON share.lead_id = l.id
  WHERE upper(l.tracking_code) = upper(btrim(code))
  UNION ALL
  SELECT i.tracking_code, 'INVESTMENT_ENQUIRY', i.status, i.created_at, project.name,
    public.public_project_details(i.project_id)
  FROM public.investments AS i
  LEFT JOIN public.projects AS project ON project.id = i.project_id AND project.is_published = true
  WHERE upper(i.tracking_code) = upper(btrim(code)) OR upper(i.reference_code) = upper(btrim(code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.track_public_enquiry(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_public_enquiry(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
