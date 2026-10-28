ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS source_payment_id uuid REFERENCES public.buyer_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_documents_generated_payment_receipt
  ON public.client_documents (source_payment_id)
  WHERE category = 'RECEIPT' AND source_type = 'GENERATED' AND source_payment_id IS NOT NULL;

UPDATE public.sales AS sale
SET buyer_user_id = account.id
FROM auth.users AS account
WHERE sale.buyer_user_id IS NULL
  AND sale.buyer_email IS NOT NULL
  AND lower(btrim(sale.buyer_email)) = lower(btrim(account.email));

CREATE OR REPLACE FUNCTION public.confirm_payment_receipt(p_document_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  confirmed_at timestamptz := clock_timestamp();
  receipt_row public.client_documents;
BEGIN
  IF NOT public.can_manage_dashboard_roles() THEN
    RAISE EXCEPTION 'Admin/Owner access is required to confirm generated receipts' USING ERRCODE = '42501';
  END IF;

  UPDATE public.client_documents
  SET receipt_confirmed_at = confirmed_at,
      receipt_confirmed_by = auth.uid(),
      approval_status = 'APPROVED',
      updated_by = auth.uid(),
      updated_at = confirmed_at
  WHERE id = p_document_id
    AND category = 'RECEIPT'
    AND source_type = 'GENERATED'
    AND source_payment_id IS NOT NULL
  RETURNING * INTO receipt_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Generated payment receipt was not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.document_workflow_events (document_id, action, from_status, to_status, comment, actor_id, actor_email)
  VALUES (receipt_row.id, 'APPROVED', receipt_row.status, receipt_row.status, 'Admin confirmed automatic receipt generation and client sharing.', auth.uid(), auth.jwt() ->> 'email');

  RETURN confirmed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_payment_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_payment_receipt(uuid) TO authenticated;
