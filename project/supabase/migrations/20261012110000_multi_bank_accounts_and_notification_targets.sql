CREATE TABLE IF NOT EXISTS public.purchase_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL DEFAULT '',
  bank_branch text NOT NULL DEFAULT '',
  account_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  swift_code text NOT NULL DEFAULT '',
  payment_instructions text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT false,
  is_quotation_default boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_published OR (btrim(bank_name) <> '' AND btrim(account_name) <> '' AND btrim(account_number) <> '')),
  CHECK (NOT is_quotation_default OR is_published)
);

ALTER TABLE public.purchase_payment_accounts
  ADD COLUMN IF NOT EXISTS is_quotation_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_payment_accounts_single_quotation_default
  ON public.purchase_payment_accounts ((is_quotation_default))
  WHERE is_quotation_default;

CREATE INDEX IF NOT EXISTS idx_purchase_payment_accounts_visible
  ON public.purchase_payment_accounts (is_published, display_order, bank_name);

ALTER TABLE public.purchase_payment_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_payment_accounts_read ON public.purchase_payment_accounts;
CREATE POLICY purchase_payment_accounts_read ON public.purchase_payment_accounts
  FOR SELECT TO authenticated
  USING (public.is_dashboard_admin() OR is_published);
DROP POLICY IF EXISTS purchase_payment_accounts_insert ON public.purchase_payment_accounts;
CREATE POLICY purchase_payment_accounts_insert ON public.purchase_payment_accounts
  FOR INSERT TO authenticated WITH CHECK (public.is_dashboard_admin());
DROP POLICY IF EXISTS purchase_payment_accounts_update ON public.purchase_payment_accounts;
CREATE POLICY purchase_payment_accounts_update ON public.purchase_payment_accounts
  FOR UPDATE TO authenticated USING (public.is_dashboard_admin()) WITH CHECK (public.is_dashboard_admin());
DROP POLICY IF EXISTS purchase_payment_accounts_delete ON public.purchase_payment_accounts;
CREATE POLICY purchase_payment_accounts_delete ON public.purchase_payment_accounts
  FOR DELETE TO authenticated USING (public.is_dashboard_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_payment_accounts TO authenticated;

DROP TRIGGER IF EXISTS audit_purchase_payment_accounts ON public.purchase_payment_accounts;
CREATE TRIGGER audit_purchase_payment_accounts
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_change();

CREATE OR REPLACE FUNCTION public.keep_one_purchase_quotation_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_quotation_default AND NOT NEW.is_published THEN
    RAISE EXCEPTION 'Only a published bank account can be selected for purchase quotations' USING ERRCODE = '22023';
  END IF;
  IF NEW.is_quotation_default THEN
    UPDATE public.purchase_payment_accounts
    SET is_quotation_default = false, updated_at = now()
    WHERE is_quotation_default AND id IS DISTINCT FROM NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_one_purchase_quotation_account ON public.purchase_payment_accounts;
CREATE TRIGGER keep_one_purchase_quotation_account
  BEFORE INSERT OR UPDATE OF is_published, is_quotation_default ON public.purchase_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.keep_one_purchase_quotation_account();

INSERT INTO public.purchase_payment_accounts (
  bank_name, bank_branch, account_name, account_number, swift_code,
  payment_instructions, is_published, is_quotation_default, updated_by, updated_at
)
SELECT
  legacy.bank_name, legacy.bank_branch, legacy.account_name, legacy.account_number,
  legacy.swift_code, legacy.payment_instructions, legacy.is_published, legacy.is_published, legacy.updated_by,
  coalesce(legacy.updated_at, now())
FROM public.purchase_payment_instructions AS legacy
WHERE nullif(btrim(legacy.bank_name), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.purchase_payment_accounts AS account
    WHERE lower(account.bank_name) = lower(legacy.bank_name)
      AND account.account_number = legacy.account_number
  );

UPDATE public.client_notifications
SET action_url = '/portal?section=profile'
WHERE kind = 'KYC_UPDATE_REQUEST'
  AND (action_url IS NULL OR action_url = '/?section=profile');

UPDATE public.client_notifications
SET action_url = '/admin?tab=leads'
WHERE kind = 'LEAD_SLA_ALERT'
  AND (action_url IS NULL OR action_url = '/?tab=leads');

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
        'Lead ID: ' || lead_row.id || '. ' || lead_row.name || ' has been in ' || replace(lead_row.status, '_', ' ') || ' without action since ' || to_char(inactivity_since, 'YYYY-MM-DD HH24:MI') || ' UTC. Open the lead, review contact history, assign a next action and due date, then record the follow-up activity.',
        'LEAD_SLA_ALERT',
        '/admin?tab=leads'
      );
      alert_count := alert_count + 1;
    ELSE
      FOR recipient_id IN SELECT id FROM public.profiles WHERE role IN ('admin', 'owner') LOOP
        INSERT INTO public.client_notifications (user_id, title, body, kind, action_url)
        VALUES (
          recipient_id,
          'Unassigned lead follow-up overdue: ' || lead_row.name,
          'Lead ID: ' || lead_row.id || '. ' || lead_row.name || ' has been in ' || replace(lead_row.status, '_', ' ') || ' without action since ' || to_char(inactivity_since, 'YYYY-MM-DD HH24:MI') || ' UTC. Assign an owner, set a next action and due date, then record the follow-up activity.',
          'LEAD_SLA_ALERT',
          '/admin?tab=leads'
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

NOTIFY pgrst, 'reload schema';