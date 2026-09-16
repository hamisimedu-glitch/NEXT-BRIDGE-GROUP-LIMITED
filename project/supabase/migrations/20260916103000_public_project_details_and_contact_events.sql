-- Publishable project details used by the public project profile.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS price_min numeric,
  ADD COLUMN IF NOT EXISTS price_max numeric,
  ADD COLUMN IF NOT EXISTS amenities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS floor_plan_url text,
  ADD COLUMN IF NOT EXISTS brochure_url text,
  ADD COLUMN IF NOT EXISTS map_url text,
  ADD COLUMN IF NOT EXISTS expected_completion text;

-- Lightweight attribution for public calls and WhatsApp conversations.
CREATE TABLE IF NOT EXISTS public.contact_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'phone')),
  context text,
  page_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_insert_contact_events" ON public.contact_events;
CREATE POLICY "public_insert_contact_events" ON public.contact_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "staff_select_contact_events" ON public.contact_events;
CREATE POLICY "staff_select_contact_events" ON public.contact_events
  FOR SELECT TO authenticated USING (public.is_dashboard_staff());
