/*
# Create leads table for enquiry capture

1. Purpose
   - Stores all public enquiry submissions (contact form, viewing requests, WhatsApp follow-ups)
   - Enables the NBG sales team to track and manage leads through the sales pipeline

2. New Tables
   - `leads`
     - `id` (uuid, primary key)
     - `name` (text, not null) — full name of the enquirer
     - `phone` (text) — contact phone number
     - `email` (text) — contact email address
     - `project` (text) — project the enquiry relates to
     - `unit` (text) — specific unit if applicable
     - `apartment_type` (text) — apartment type the customer is interested in
     - `source` (text) — where the lead came from (contact-form, private-viewing, whatsapp, phone)
     - `message` (text) — the enquiry message
     - `status` (text, default 'NEW') — lead pipeline status (NEW, CONTACTED, QUALIFIED, VIEWING_BOOKED, NEGOTIATING, CONVERTED, LOST)
     - `assigned_consultant` (text) — sales consultant assigned to this lead
     - `notes` (text) — internal notes
     - `created_at` (timestamptz, default now())

3. Security
   - Enable RLS on `leads`.
   - Public (anon) can INSERT new leads — this is how the contact/viewing forms submit.
   - Public (anon) CANNOT SELECT, UPDATE, or DELETE leads — only authenticated admin/staff roles can.
   - Authenticated users can SELECT leads (for admin dashboard access).

4. Indexes
   - Index on `created_at` for chronological sorting
   - Index on `status` for pipeline filtering
*/

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  project text,
  unit text,
  apartment_type text,
  source text,
  message text,
  status text NOT NULL DEFAULT 'NEW',
  assigned_consultant text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Public can insert leads (form submissions)
DROP POLICY IF EXISTS "anon_insert_leads" ON leads;
CREATE POLICY "anon_insert_leads" ON leads FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Only authenticated staff can view leads
DROP POLICY IF EXISTS "auth_select_leads" ON leads;
CREATE POLICY "auth_select_leads" ON leads FOR SELECT
  TO authenticated USING (true);

-- Only authenticated staff can update leads
DROP POLICY IF EXISTS "auth_update_leads" ON leads;
CREATE POLICY "auth_update_leads" ON leads FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Only authenticated staff can delete leads
DROP POLICY IF EXISTS "auth_delete_leads" ON leads;
CREATE POLICY "auth_delete_leads" ON leads FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status);
