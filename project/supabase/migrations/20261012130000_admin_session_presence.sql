CREATE TABLE IF NOT EXISTS public.admin_session_presence (
  session_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  region text,
  country text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_session_presence_last_seen
  ON public.admin_session_presence (last_seen_at DESC);

ALTER TABLE public.admin_session_presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_session_presence_read ON public.admin_session_presence;
CREATE POLICY admin_session_presence_read ON public.admin_session_presence
  FOR SELECT TO authenticated USING (public.is_dashboard_admin());
GRANT SELECT ON public.admin_session_presence TO authenticated;