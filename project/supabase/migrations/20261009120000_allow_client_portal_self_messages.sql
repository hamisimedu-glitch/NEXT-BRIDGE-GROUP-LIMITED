DROP POLICY IF EXISTS dashboard_messages_send_thread ON public.dashboard_messages;

CREATE POLICY dashboard_messages_send_thread ON public.dashboard_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (sender_role = 'CLIENT' AND client_id = auth.uid())
      OR (sender_role = 'STAFF' AND public.is_dashboard_staff())
    )
  );