-- Persist unit payment modes and enforce the selected mode when a sale is created.
ALTER TABLE public.project_units
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'INSTALLMENTS',
  ADD COLUMN IF NOT EXISTS bathrooms integer,
  ADD COLUMN IF NOT EXISTS description text;

UPDATE public.project_units AS unit
SET payment_mode = CASE WHEN project.payment_policy = 'ONE_TIME_ONLY' THEN 'ONE_TIME' ELSE 'INSTALLMENTS' END
FROM public.projects AS project
WHERE project.id = unit.project_id
  AND unit.payment_mode = 'INSTALLMENTS'
  AND project.payment_policy = 'ONE_TIME_ONLY';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_units_payment_mode_check'
      AND conrelid = 'public.project_units'::regclass
  ) THEN
    ALTER TABLE public.project_units
      ADD CONSTRAINT project_units_payment_mode_check
      CHECK (payment_mode IN ('ONE_TIME', 'INSTALLMENTS'));
  END IF;
END;
$$;

GRANT UPDATE (payment_mode) ON public.project_units TO authenticated;
GRANT UPDATE (bathrooms, description) ON public.project_units TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_unit_payment_mode_from_project()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.projects AS project
    WHERE project.id = NEW.project_id
      AND project.payment_policy = 'ONE_TIME_ONLY'
  ) THEN
    NEW.payment_mode := 'ONE_TIME';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_unit_payment_mode_from_project ON public.project_units;
CREATE TRIGGER enforce_unit_payment_mode_from_project
  BEFORE INSERT OR UPDATE OF project_id, payment_mode ON public.project_units
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unit_payment_mode_from_project();

CREATE OR REPLACE FUNCTION public.sync_one_time_project_unit_modes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_policy = 'ONE_TIME_ONLY' THEN
    UPDATE public.project_units
    SET payment_mode = 'ONE_TIME'
    WHERE project_id = NEW.id AND payment_mode <> 'ONE_TIME';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_one_time_project_unit_modes ON public.projects;
CREATE TRIGGER sync_one_time_project_unit_modes
  AFTER UPDATE OF payment_policy ON public.projects
  FOR EACH ROW
  WHEN (NEW.payment_policy = 'ONE_TIME_ONLY')
  EXECUTE FUNCTION public.sync_one_time_project_unit_modes();

CREATE OR REPLACE FUNCTION public.enforce_project_payment_policy_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  unit_mode text;
  project_policy text;
  selected_frequency text;
BEGIN
  SELECT unit.payment_mode, project.payment_policy, sale.installment_frequency
  INTO unit_mode, project_policy, selected_frequency
  FROM public.sales AS sale
  JOIN public.project_units AS unit ON unit.id = sale.unit_id
  LEFT JOIN public.projects AS project ON project.id = unit.project_id
  WHERE sale.id = NEW.id;

  IF unit_mode = 'ONE_TIME' AND upper(coalesce(selected_frequency, '')) <> 'ONE_TIME' THEN
    RAISE EXCEPTION 'This unit requires a one-time payment.' USING ERRCODE = '22023';
  END IF;
  IF unit_mode = 'INSTALLMENTS' AND upper(coalesce(selected_frequency, '')) = 'ONE_TIME' THEN
    RAISE EXCEPTION 'This unit is configured for installment payments.' USING ERRCODE = '22023';
  END IF;
  IF project_policy = 'ONE_TIME_ONLY' AND upper(coalesce(selected_frequency, '')) <> 'ONE_TIME' THEN
    RAISE EXCEPTION 'This project requires a one-time payment for its homes.' USING ERRCODE = '22023';
  END IF;
  RETURN NULL;
END;
$$;

-- Lead stage ownership, outcome, activity clock, and SLA escalation.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_consultant_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS sla_last_alerted_at timestamptz;

UPDATE public.leads AS lead
SET stage_entered_at = coalesce(
      lead.stage_entered_at,
      (SELECT max(audit.created_at)
       FROM public.audit_logs AS audit
       WHERE audit.entity_type = 'leads'
         AND audit.entity_id = lead.id
         AND audit.action = 'UPDATE'
         AND audit.old_data ->> 'status' IS DISTINCT FROM audit.new_data ->> 'status'),
      lead.created_at,
      now()),
    last_action_at = greatest(
      coalesce(lead.last_action_at, lead.last_contacted_at, lead.created_at, now()),
      coalesce((SELECT max(audit.created_at)
                FROM public.audit_logs AS audit
                WHERE audit.entity_type = 'leads'
                  AND audit.entity_id = lead.id
                  AND audit.action IN ('INSERT', 'UPDATE')), lead.created_at, now()),
      coalesce((SELECT max(activity.created_at)
                FROM public.lead_activities AS activity
                WHERE activity.lead_id = lead.id), lead.created_at, now()))
WHERE lead.stage_entered_at IS NULL OR lead.last_action_at IS NULL;

UPDATE public.leads AS lead
SET assigned_consultant_user_id = (
  SELECT profile.id
  FROM public.profiles AS profile
  WHERE profile.full_name = lead.assigned_consultant
    AND profile.role IN ('staff', 'admin', 'owner')
  ORDER BY profile.created_at, profile.id
  LIMIT 1
)
WHERE lead.assigned_consultant_user_id IS NULL
  AND nullif(btrim(lead.assigned_consultant), '') IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_outcome_check'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('WON', 'LOST'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_leads_stage_sla
  ON public.leads (stage_entered_at, last_action_at)
  WHERE status NOT IN ('CONVERTED', 'LOST');

CREATE OR REPLACE FUNCTION public.track_lead_stage_and_outcome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_entered_at := coalesce(NEW.stage_entered_at, NEW.created_at, now());
    NEW.last_action_at := coalesce(NEW.last_action_at, NEW.created_at, now());
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'CONVERTED' AND OLD.status <> 'NEGOTIATING' THEN
        RAISE EXCEPTION 'Move the lead through Negotiating before recording a Won outcome.' USING ERRCODE = '22023';
      END IF;
      IF NEW.status NOT IN ('CONVERTED', 'LOST')
        AND array_position(ARRAY['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_BOOKED', 'NEGOTIATING'], NEW.status)
          > array_position(ARRAY['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_BOOKED', 'NEGOTIATING'], OLD.status) + 1 THEN
        RAISE EXCEPTION 'Lead stages must progress one step at a time.' USING ERRCODE = '22023';
      END IF;
      NEW.stage_entered_at := now();
      NEW.last_action_at := now();
      NEW.sla_last_alerted_at := NULL;
    ELSIF NEW.assigned_consultant IS DISTINCT FROM OLD.assigned_consultant
       OR NEW.assigned_consultant_user_id IS DISTINCT FROM OLD.assigned_consultant_user_id
       OR NEW.next_action IS DISTINCT FROM OLD.next_action
       OR NEW.next_action_at IS DISTINCT FROM OLD.next_action_at
       OR NEW.priority IS DISTINCT FROM OLD.priority THEN
      NEW.last_action_at := now();
      NEW.sla_last_alerted_at := NULL;
    END IF;
  END IF;

  IF NEW.status = 'CONVERTED' THEN
    NEW.outcome := 'WON';
  ELSIF NEW.status = 'LOST' THEN
    NEW.outcome := 'LOST';
  ELSE
    NEW.outcome := NULL;
    NEW.outcome_notes := NULL;
    NEW.sla_last_alerted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_lead_stage_and_outcome ON public.leads;
CREATE TRIGGER track_lead_stage_and_outcome
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.track_lead_stage_and_outcome();

CREATE OR REPLACE FUNCTION public.refresh_lead_action_clock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
  SET last_action_at = NEW.created_at,
      sla_last_alerted_at = NULL
  WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_lead_action_clock ON public.lead_activities;
CREATE TRIGGER refresh_lead_action_clock
  AFTER INSERT ON public.lead_activities
  FOR EACH ROW EXECUTE FUNCTION public.refresh_lead_action_clock();

CREATE OR REPLACE FUNCTION public.notify_stalled_leads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_row public.leads%ROWTYPE;
  recipient_id uuid;
  alert_count integer := 0;
  inactivity_since timestamptz;
BEGIN
  FOR lead_row IN
    SELECT * FROM public.leads
    WHERE status NOT IN ('CONVERTED', 'LOST')
      AND coalesce(last_action_at, stage_entered_at, created_at) <= now() - interval '48 hours'
      AND (sla_last_alerted_at IS NULL OR sla_last_alerted_at < coalesce(last_action_at, stage_entered_at, created_at))
  LOOP
    inactivity_since := coalesce(lead_row.last_action_at, lead_row.stage_entered_at, lead_row.created_at);
    IF lead_row.assigned_consultant_user_id IS NOT NULL THEN
      recipient_id := lead_row.assigned_consultant_user_id;
      INSERT INTO public.client_notifications (user_id, title, body, kind, action_url)
      VALUES (
        recipient_id,
        'Lead follow-up overdue: ' || lead_row.name,
        'Lead ID: ' || lead_row.id || '. ' || lead_row.name || ' has been in ' || replace(lead_row.status, '_', ' ') || ' without action since ' || to_char(inactivity_since, 'YYYY-MM-DD HH24:MI') || ' UTC. Please record the next follow-up or progress the lead.',
        'LEAD_SLA_ALERT',
        '/?tab=leads'
      );
      alert_count := alert_count + 1;
    ELSE
      FOR recipient_id IN SELECT id FROM public.profiles WHERE role IN ('admin', 'owner') LOOP
        INSERT INTO public.client_notifications (user_id, title, body, kind, action_url)
        VALUES (
          recipient_id,
          'Unassigned lead follow-up overdue: ' || lead_row.name,
          'Lead ID: ' || lead_row.id || '. ' || lead_row.name || ' has been in ' || replace(lead_row.status, '_', ' ') || ' without action since ' || to_char(inactivity_since, 'YYYY-MM-DD HH24:MI') || ' UTC. Assign an NBG representative and record the next step.',
          'LEAD_SLA_ALERT',
          '/?tab=leads'
        );
        alert_count := alert_count + 1;
      END LOOP;
    END IF;
    UPDATE public.leads SET sla_last_alerted_at = now() WHERE id = lead_row.id;
  END LOOP;
  RETURN alert_count;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_stalled_leads() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nbg-lead-48h-sla-alerts';
  PERFORM cron.schedule('nbg-lead-48h-sla-alerts', '*/15 * * * *', 'SELECT public.notify_stalled_leads();');
END;
$$;

NOTIFY pgrst, 'reload schema';
