/*
# Lead action tracking

Adds structured fields for prioritisation, ownership, follow-up scheduling, and
contact history so every lead can have a clear next action.
*/

ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_next_action_at ON leads (next_action_at);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads (priority);
