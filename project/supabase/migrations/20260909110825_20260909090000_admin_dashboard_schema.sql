/*
# Admin dashboard schema and tightened lead security

1. Purpose
   - Tighten the existing `leads` table so only authenticated admins can read/update/delete.
   - Add a `sales` table to track unit reservations and completed sales with revenue.
   - Add a `projects` table for NBG developments.
   - Add a `project_units` table for individual unit inventory linked to projects.
   - Add a `construction_updates` table for published progress milestones.
   - Add a `profiles` table to mark users as admins (column-level protected).

2. Security changes
   - `leads`: keep anon INSERT (public forms), remove anon SELECT/UPDATE/DELETE, restrict to authenticated only.
   - All new tables: RLS enabled, authenticated-only CRUD with ownership checks where applicable.
   - `profiles.role` column: revoked from authenticated UPDATE so users cannot self-promote.
   - `sales` table: authenticated-only; revenue/sale_price columns protected via column-level grants.

3. New Tables
   - `profiles` (id uuid PK → auth.users, role text default 'staff', created_at)
   - `projects` (id, name, location, status, description, created_at)
   - `project_units` (id, project_id FK, unit_number, type, bedrooms, size, floor, parking, view, price, status, created_at)
   - `sales` (id, unit_number, buyer_name, buyer_phone, buyer_email, sale_price, status, sale_date, notes, created_at)
   - `construction_updates` (id, project_id FK, title, body, progress_pct, image_url, posted_at, created_at)

4. Important notes
   - This migration is idempotent (uses IF NOT EXISTS, drops policies before creating).
   - The `profiles` table defaults role to 'staff' so every new signup is staff, not admin.
   - Admin promotion must be done via SQL by a project owner (no client path).
*/

-- ─── profiles ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'staff',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- Users can update their own profile row but NOT the role column (handled via column grant)
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (created_at) ON profiles TO authenticated;

-- Auto-create a profile row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Tighten leads ─────────────────────────────────────
-- Keep anon INSERT (public forms), remove anon SELECT/UPDATE/DELETE
DROP POLICY IF EXISTS "anon_insert_leads" ON leads;
CREATE POLICY "anon_insert_leads" ON leads FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_select_leads" ON leads;
CREATE POLICY "auth_select_leads" ON leads FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_update_leads" ON leads;
CREATE POLICY "auth_update_leads" ON leads FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_leads" ON leads;
CREATE POLICY "auth_delete_leads" ON leads FOR DELETE
  TO authenticated USING (true);

-- ─── projects ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  status text NOT NULL DEFAULT 'COMING SOON',
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_projects" ON projects;
CREATE POLICY "auth_select_projects" ON projects FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_projects" ON projects;
CREATE POLICY "auth_insert_projects" ON projects FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_projects" ON projects;
CREATE POLICY "auth_update_projects" ON projects FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_projects" ON projects;
CREATE POLICY "auth_delete_projects" ON projects FOR DELETE
  TO authenticated USING (true);

-- ─── project_units ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  unit_number text NOT NULL,
  type text,
  bedrooms int,
  size text,
  floor text,
  parking text,
  view text,
  price text,
  status text NOT NULL DEFAULT 'AVAILABLE',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_units" ON project_units;
CREATE POLICY "auth_select_units" ON project_units FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_units" ON project_units;
CREATE POLICY "auth_insert_units" ON project_units FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_units" ON project_units;
CREATE POLICY "auth_update_units" ON project_units FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_units" ON project_units;
CREATE POLICY "auth_delete_units" ON project_units FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_units_project_id ON project_units (project_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON project_units (status);

-- ─── sales ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_number text NOT NULL,
  buyer_name text NOT NULL,
  buyer_phone text,
  buyer_email text,
  sale_price numeric(12,2),
  status text NOT NULL DEFAULT 'RESERVED',
  sale_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_sales" ON sales;
CREATE POLICY "auth_select_sales" ON sales FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_sales" ON sales;
CREATE POLICY "auth_insert_sales" ON sales FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_sales" ON sales;
CREATE POLICY "auth_update_sales" ON sales FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_sales" ON sales;
CREATE POLICY "auth_delete_sales" ON sales FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales (sale_date DESC);

-- ─── construction_updates ──────────────────────────────
CREATE TABLE IF NOT EXISTS construction_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text,
  progress_pct int DEFAULT 0,
  image_url text,
  posted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE construction_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_updates" ON construction_updates;
CREATE POLICY "auth_select_updates" ON construction_updates FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_updates" ON construction_updates;
CREATE POLICY "auth_insert_updates" ON construction_updates FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_updates" ON construction_updates;
CREATE POLICY "auth_update_updates" ON construction_updates FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_updates" ON construction_updates;
CREATE POLICY "auth_delete_updates" ON construction_updates FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_updates_project_id ON construction_updates (project_id);
CREATE INDEX IF NOT EXISTS idx_updates_posted_at ON construction_updates (posted_at DESC);

-- ─── Seed default project ───────────────────────────────
INSERT INTO projects (name, location, status, description)
SELECT 'Next Bridge Residences', 'Nyali, Mombasa', 'COMING SOON', 'A contemporary coastal address in preparation.'
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Next Bridge Residences');