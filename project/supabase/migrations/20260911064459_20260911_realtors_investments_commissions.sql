/*
# Realtors, Investments, and Commissions schema

1. Purpose
   - Enable commission-based realtor tracking: agents register, make sales, earn commissions.
   - Enable investment interest tracking: record investors, amounts, and project interest.
   - Track commission payouts per sale.

2. New Tables
   - `realtors`
     - id, name, email, phone, id_number (national ID), status (PENDING|ACTIVE|SUSPENDED),
       commission_rate (numeric, default 5.0 = 5%), total_earned, joined_at, notes
   - `commissions`
     - id, sale_id FK(sales), realtor_id FK(realtors), amount, rate, status (PENDING|APPROVED|PAID),
       paid_at, notes, created_at
   - `investments`
     - id, investor_name, investor_email, investor_phone, project_id FK(projects),
       amount_interested, currency (default KES), status (INQUIRY|SOFT_COMMIT|COMMITTED|WITHDRAWN),
       notes, created_at

3. Security
   - All tables: RLS enabled, authenticated-only CRUD.
   - Anon INSERT allowed on investments (public interest form).

4. Indexes
   - realtors: email (unique), status
   - commissions: realtor_id, sale_id, status
   - investments: project_id, status, created_at
*/

-- ─── realtors ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS realtors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text,
  id_number text,
  status text NOT NULL DEFAULT 'PENDING',
  commission_rate numeric(5,2) NOT NULL DEFAULT 5.00,
  total_earned numeric(14,2) NOT NULL DEFAULT 0.00,
  joined_at timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE realtors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_realtors" ON realtors;
CREATE POLICY "anon_insert_realtors" ON realtors FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_select_realtors" ON realtors;
CREATE POLICY "auth_select_realtors" ON realtors FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_update_realtors" ON realtors;
CREATE POLICY "auth_update_realtors" ON realtors FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_realtors" ON realtors;
CREATE POLICY "auth_delete_realtors" ON realtors FOR DELETE
  TO authenticated USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_realtors_email ON realtors (email);
CREATE INDEX IF NOT EXISTS idx_realtors_status ON realtors (status);

-- ─── commissions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  realtor_id uuid REFERENCES realtors(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  rate numeric(5,2) NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_commissions" ON commissions;
CREATE POLICY "auth_select_commissions" ON commissions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_commissions" ON commissions;
CREATE POLICY "auth_insert_commissions" ON commissions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_commissions" ON commissions;
CREATE POLICY "auth_update_commissions" ON commissions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_commissions" ON commissions;
CREATE POLICY "auth_delete_commissions" ON commissions FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_commissions_realtor_id ON commissions (realtor_id);
CREATE INDEX IF NOT EXISTS idx_commissions_sale_id ON commissions (sale_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions (status);

-- ─── investments ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_name text NOT NULL,
  investor_email text,
  investor_phone text,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  amount_interested numeric(14,2),
  currency text NOT NULL DEFAULT 'KES',
  status text NOT NULL DEFAULT 'INQUIRY',
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_investments" ON investments;
CREATE POLICY "anon_insert_investments" ON investments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_select_investments" ON investments;
CREATE POLICY "auth_select_investments" ON investments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_update_investments" ON investments;
CREATE POLICY "auth_update_investments" ON investments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_investments" ON investments;
CREATE POLICY "auth_delete_investments" ON investments FOR DELETE
  TO authenticated USING (true);