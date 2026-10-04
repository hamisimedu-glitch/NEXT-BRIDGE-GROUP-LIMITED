CREATE TABLE IF NOT EXISTS public.purchase_payment_instructions (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  bank_name text NOT NULL DEFAULT '',
  bank_branch text NOT NULL DEFAULT '',
  account_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  swift_code text NOT NULL DEFAULT '',
  payment_instructions text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_published OR (btrim(bank_name) <> '' AND btrim(account_name) <> '' AND btrim(account_number) <> ''))
);

ALTER TABLE public.purchase_payment_instructions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_payment_instructions_read ON public.purchase_payment_instructions;
CREATE POLICY purchase_payment_instructions_read ON public.purchase_payment_instructions
  FOR SELECT TO authenticated
  USING (public.is_dashboard_admin() OR is_published);
DROP POLICY IF EXISTS purchase_payment_instructions_write ON public.purchase_payment_instructions;
CREATE POLICY purchase_payment_instructions_write ON public.purchase_payment_instructions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dashboard_admin());
DROP POLICY IF EXISTS purchase_payment_instructions_update ON public.purchase_payment_instructions;
CREATE POLICY purchase_payment_instructions_update ON public.purchase_payment_instructions
  FOR UPDATE TO authenticated
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());
GRANT SELECT, INSERT, UPDATE ON public.purchase_payment_instructions TO authenticated;

DROP TRIGGER IF EXISTS audit_purchase_payment_instructions ON public.purchase_payment_instructions;
CREATE TRIGGER audit_purchase_payment_instructions
  AFTER INSERT OR UPDATE ON public.purchase_payment_instructions
  FOR EACH ROW EXECUTE FUNCTION public.record_audit_change();

ALTER TABLE public.client_payment_schedule
  ADD COLUMN IF NOT EXISTS payment_reference text;

CREATE OR REPLACE FUNCTION public.create_client_purchase_request_with_mode(
  p_unit_id uuid,
  p_deposit numeric,
  p_installment_count integer,
  p_frequency text,
  p_payment_mode text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_sale_id uuid;
  sale_price numeric(14,2);
  unit_number text;
  generated_payment_reference text;
  buyer_label text;
  payment_plan_label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to submit a purchase request' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_payment_instructions WHERE singleton AND is_published) THEN
    RAISE EXCEPTION 'Official NBG bank payment instructions are not available yet. Please contact the NBG team.' USING ERRCODE = '55000';
  END IF;
  IF upper(coalesce(p_payment_mode, '')) NOT IN ('INSTALLMENTS', 'FULL') THEN
    RAISE EXCEPTION 'Select a valid payment plan';
  END IF;
  IF upper(p_payment_mode) = 'FULL' AND p_installment_count <> 0 THEN
    RAISE EXCEPTION 'A one-time payment cannot include installments';
  END IF;

  created_sale_id := public.create_client_purchase_request(
    p_unit_id,
    p_deposit,
    p_installment_count,
    p_frequency
  );

  SELECT sale.sale_price, sale.unit_number, coalesce(nullif(profile.full_name, ''), sale.buyer_name)
  INTO sale_price, unit_number, buyer_label
  FROM public.sales AS sale
  LEFT JOIN public.profiles AS profile ON profile.id = sale.buyer_user_id
  WHERE sale.id = created_sale_id;
  generated_payment_reference := 'NBG-PURCHASE-' || upper(replace(created_sale_id::text, '-', ''));
  payment_plan_label := CASE WHEN upper(p_payment_mode) = 'FULL' THEN 'One-time full payment' ELSE 'Deposit plus installments' END;

  IF upper(p_payment_mode) = 'FULL' THEN
    IF p_deposit <> sale_price THEN
      RAISE EXCEPTION 'A one-time payment request must cover the full confirmed unit price';
    END IF;

    UPDATE public.sales
    SET installment_frequency = 'ONE_TIME',
      notes = 'Client purchase request. Full one-time amount pending NBG payment verification.'
    WHERE id = created_sale_id;

    UPDATE public.buyer_installments
    SET notes = 'Full one-time payment pending NBG verification.'
    WHERE sale_id = created_sale_id AND installment_number = 1;

    UPDATE public.client_payment_schedule
    SET description = 'One-time payment · Unit ' || unit_number
    WHERE buyer_installment_id IN (
      SELECT installment.id
      FROM public.buyer_installments AS installment
      WHERE installment.sale_id = created_sale_id
    );

    UPDATE public.client_reservation_stages AS stage
    SET notes = 'One-time payment request submitted; payment pending NBG verification.'
    WHERE stage.id = (
      SELECT latest_stage.id
      FROM public.client_reservation_stages AS latest_stage
      WHERE latest_stage.user_id = auth.uid()
        AND latest_stage.unit_id = p_unit_id
        AND latest_stage.stage = 'DEPOSIT'
      ORDER BY latest_stage.created_at DESC
      LIMIT 1
    );
  END IF;

  UPDATE public.client_payment_schedule
  SET payment_reference = generated_payment_reference
  WHERE buyer_installment_id IN (
    SELECT installment.id
    FROM public.buyer_installments AS installment
    WHERE installment.sale_id = created_sale_id
  );

  IF NOT public.is_dashboard_staff() THEN
    INSERT INTO public.dashboard_messages (client_id, sender_id, sender_role, body)
    VALUES (
      auth.uid(),
      auth.uid(),
      'CLIENT',
      format('Purchase request submitted: %s · Unit %s · %s · Amount %s KES · Payment reference %s. Please confirm the official bank remittance details and quotation availability.', buyer_label, unit_number, payment_plan_label, to_char(sale_price, 'FM999,999,999,990.00'), generated_payment_reference)
    );
  END IF;

  RETURN created_sale_id;
END;
$$;

DROP FUNCTION IF EXISTS public.register_export_verification(text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.register_export_verification(
  p_verification_code text,
  p_title text,
  p_category text,
  p_document_ref text,
  p_content_hash text,
  p_purchase_sale_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_is_staff boolean := public.is_dashboard_staff();
  reserved_user uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT caller_is_staff AND p_category NOT IN ('CLIENT_PAYMENT_STATEMENT', 'CLIENT_PURCHASE_QUOTATION') THEN
    RAISE EXCEPTION 'Staff access required to register this export' USING ERRCODE = '42501';
  END IF;
  IF NOT caller_is_staff AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'client'
  ) THEN
    RAISE EXCEPTION 'Client account required' USING ERRCODE = '42501';
  END IF;
  IF p_category = 'CLIENT_PURCHASE_QUOTATION' AND NOT EXISTS (
    SELECT 1 FROM public.sales AS sale
    WHERE sale.id = p_purchase_sale_id AND sale.buyer_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Purchase quotation must belong to the signed-in buyer' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_verification_code), '') = ''
    OR coalesce(btrim(p_title), '') = ''
    OR coalesce(btrim(p_document_ref), '') = ''
    OR coalesce(btrim(p_content_hash), '') = '' THEN
    RAISE EXCEPTION 'Verification metadata is incomplete' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.export_code_reservations
  WHERE verification_code = upper(btrim(p_verification_code))
    AND user_id = auth.uid()
    AND expires_at > now()
  RETURNING user_id INTO reserved_user;
  IF reserved_user IS NULL THEN
    RAISE EXCEPTION 'Verification code was not reserved by this account or has expired' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.verified_exports (verification_code, title, category, document_ref, content_hash, generated_by)
  VALUES (upper(btrim(p_verification_code)), btrim(p_title), upper(btrim(p_category)), upper(btrim(p_document_ref)), lower(btrim(p_content_hash)), auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.register_export_verification(text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_export_verification(text, text, text, text, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
