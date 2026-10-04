CREATE TABLE IF NOT EXISTS public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL DEFAULT 'NOTE',
  channel text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_created
  ON public.lead_activities(lead_id, created_at DESC);

GRANT SELECT ON public.lead_activities TO authenticated;
GRANT INSERT ON public.lead_activities TO authenticated;

DROP POLICY IF EXISTS "staff_select_lead_activities" ON public.lead_activities;
CREATE POLICY "staff_select_lead_activities" ON public.lead_activities
  FOR SELECT TO authenticated USING (public.is_dashboard_staff());
DROP POLICY IF EXISTS "staff_insert_lead_activities" ON public.lead_activities;
CREATE POLICY "staff_insert_lead_activities" ON public.lead_activities
  FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_staff());

CREATE OR REPLACE FUNCTION public.record_lead_activity(
  p_lead_id uuid,
  p_activity_type text,
  p_channel text,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  activity_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_dashboard_staff() THEN
    RAISE EXCEPTION 'Staff access required to record lead activity' USING ERRCODE = '42501';
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

NOTIFY pgrst, 'reload schema';
