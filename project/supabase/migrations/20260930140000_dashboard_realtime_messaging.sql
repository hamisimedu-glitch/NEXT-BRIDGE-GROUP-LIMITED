CREATE TABLE IF NOT EXISTS public.dashboard_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('STAFF', 'CLIENT')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_messages_thread_date
  ON public.dashboard_messages(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_messages_unread
  ON public.dashboard_messages(client_id, sender_role, read_at)
  WHERE read_at IS NULL;

ALTER TABLE public.dashboard_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_messages REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "dashboard_messages_read_thread" ON public.dashboard_messages;
CREATE POLICY "dashboard_messages_read_thread" ON public.dashboard_messages
  FOR SELECT TO authenticated
  USING (public.is_dashboard_staff() OR client_id = auth.uid());

DROP POLICY IF EXISTS "dashboard_messages_send_thread" ON public.dashboard_messages;
CREATE POLICY "dashboard_messages_send_thread" ON public.dashboard_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (public.is_dashboard_staff() AND sender_role = 'STAFF')
      OR (NOT public.is_dashboard_staff() AND sender_role = 'CLIENT' AND client_id = auth.uid())
    )
  );

GRANT SELECT, INSERT ON public.dashboard_messages TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_dashboard_messages_read(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_dashboard_staff() THEN
    UPDATE public.dashboard_messages
    SET read_at = now()
    WHERE client_id = p_client_id AND sender_role = 'CLIENT' AND read_at IS NULL;
  ELSIF p_client_id = auth.uid() THEN
    UPDATE public.dashboard_messages
    SET read_at = now()
    WHERE client_id = auth.uid() AND sender_role = 'STAFF' AND read_at IS NULL;
  ELSE
    RAISE EXCEPTION 'You cannot mark this conversation as read' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_dashboard_messages_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_dashboard_messages_read(uuid) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dashboard_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_messages;
    END IF;
    IF to_regclass('public.client_notifications') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'client_notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.client_notifications;
    END IF;
  END IF;
END;
$$;
