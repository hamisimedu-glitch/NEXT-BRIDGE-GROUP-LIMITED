-- Add actionable client notifications and private payment evidence storage.
ALTER TABLE public.client_notifications
  ADD COLUMN IF NOT EXISTS action_url text;

UPDATE public.client_notifications
SET action_url = '/?section=profile'
WHERE kind = 'KYC_UPDATE_REQUEST'
  AND action_url IS NULL;

CREATE OR REPLACE FUNCTION public.request_client_kyc_update(p_user_id uuid)
RETURNS public.client_kyc_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.profiles%ROWTYPE;
  missing_fields text[];
  request_row public.client_kyc_requests%ROWTYPE;
BEGIN
  IF NOT public.is_dashboard_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO profile_row FROM public.profiles WHERE id = p_user_id AND role = 'client';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client profile not found' USING ERRCODE = '22023';
  END IF;

  missing_fields := array_remove(ARRAY[
    CASE WHEN nullif(btrim(profile_row.identity_document_type), '') IS NULL THEN 'identity document type' END,
    CASE WHEN nullif(btrim(profile_row.identity_document_number), '') IS NULL THEN 'ID / passport number' END,
    CASE WHEN nullif(btrim(profile_row.residential_address), '') IS NULL THEN 'residential address' END
  ], NULL);
  IF cardinality(missing_fields) = 0 THEN
    RAISE EXCEPTION 'Client KYC details are already complete' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.client_kyc_requests (user_id, requested_fields, requested_by, requested_at)
  VALUES (p_user_id, missing_fields, auth.uid(), now())
  ON CONFLICT (user_id) WHERE status = 'PENDING'
  DO UPDATE SET requested_fields = EXCLUDED.requested_fields,
                requested_by = EXCLUDED.requested_by,
                requested_at = EXCLUDED.requested_at
  RETURNING * INTO request_row;

  INSERT INTO public.client_notifications (user_id, title, body, kind, action_url)
  VALUES (
    p_user_id,
    'Action required: complete your KYC details',
    'Please update your profile with: ' || array_to_string(missing_fields, ', ') || '. This information is required to prepare your legal documents. Open Profile & security and save your updated details.',
    'KYC_UPDATE_REQUEST',
    '/?section=profile'
  );

  RETURN request_row;
END;
$$;

REVOKE ALL ON FUNCTION public.request_client_kyc_update(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_client_kyc_update(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.payment_proof_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT 'Bank remittance advice',
  proof_url text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_notes text
);

ALTER TABLE public.payment_proof_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_proof_uploads_select_own ON public.payment_proof_uploads;
CREATE POLICY payment_proof_uploads_select_own
  ON public.payment_proof_uploads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_dashboard_staff());

DROP POLICY IF EXISTS payment_proof_uploads_insert_own ON public.payment_proof_uploads;
CREATE POLICY payment_proof_uploads_insert_own
  ON public.payment_proof_uploads
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() OR public.is_dashboard_staff())
    AND EXISTS (
      SELECT 1 FROM public.sales AS sale
      WHERE sale.id = sale_id AND sale.buyer_user_id = user_id
    )
  );

DROP POLICY IF EXISTS payment_proof_uploads_update_staff ON public.payment_proof_uploads;
CREATE POLICY payment_proof_uploads_update_staff
  ON public.payment_proof_uploads
  FOR UPDATE TO authenticated
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

CREATE INDEX IF NOT EXISTS idx_payment_proof_uploads_sale
  ON public.payment_proof_uploads(sale_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_proof_uploads_user
  ON public.payment_proof_uploads(user_id, uploaded_at DESC);

INSERT INTO storage.buckets (id, name, public)
VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS payment_proofs_upload_scoped ON storage.objects;
CREATE POLICY payment_proofs_upload_scoped
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND split_part(name, '/', 1) = 'payment-proofs'
    AND EXISTS (
      SELECT 1 FROM public.sales AS sale
      WHERE sale.id::text = split_part(name, '/', 2)
        AND sale.buyer_user_id::text = split_part(name, '/', 3)
        AND (sale.buyer_user_id = auth.uid() OR public.is_dashboard_staff())
    )
  );

DROP POLICY IF EXISTS payment_proofs_read_scoped ON storage.objects;
CREATE POLICY payment_proofs_read_scoped
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND split_part(name, '/', 1) = 'payment-proofs'
    AND (
      public.is_dashboard_staff()
      OR EXISTS (
        SELECT 1 FROM public.sales AS sale
        WHERE sale.id::text = split_part(name, '/', 2)
          AND sale.buyer_user_id::text = split_part(name, '/', 3)
          AND sale.buyer_user_id = auth.uid()
      )
    )
  );
