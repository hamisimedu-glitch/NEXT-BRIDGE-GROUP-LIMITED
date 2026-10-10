UPDATE public.client_documents
SET is_global = false
WHERE is_global = true
  AND user_id IS NOT NULL;

UPDATE public.client_documents AS document
SET user_id = sale.buyer_user_id,
    is_global = false,
    recipient_name = COALESCE(NULLIF(document.recipient_name, ''), sale.buyer_name)
FROM public.sales AS sale
WHERE document.is_global = true
  AND document.user_id IS NULL
  AND document.source_record_id = sale.id
  AND sale.buyer_user_id IS NOT NULL
  AND document.category IN ('AGREEMENT', 'RECEIPT', 'CLIENT_INVOICE', 'QUOTATION');

UPDATE public.client_documents AS document
SET user_id = sale.buyer_user_id,
    is_global = false,
    recipient_name = COALESCE(NULLIF(document.recipient_name, ''), sale.buyer_name)
FROM public.buyer_payments AS payment
JOIN public.sales AS sale ON sale.id = payment.sale_id
WHERE document.is_global = true
  AND document.user_id IS NULL
  AND document.source_record_id = payment.id
  AND sale.buyer_user_id IS NOT NULL
  AND document.category IN ('AGREEMENT', 'RECEIPT', 'CLIENT_INVOICE', 'QUOTATION');

UPDATE public.client_documents AS document
SET user_id = (document.form_data #>> '{client,id}')::uuid,
    is_global = false
WHERE document.is_global = true
  AND document.user_id IS NULL
  AND document.category IN ('AGREEMENT', 'RECEIPT', 'CLIENT_INVOICE', 'QUOTATION')
  AND document.form_data #>> '{client,id}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE public.client_documents
SET is_global = false
WHERE is_global = true
  AND upper(btrim(category)) NOT IN ('BROCHURE', 'FLOOR_PLAN');

CREATE OR REPLACE FUNCTION public.enforce_client_document_audience()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    NEW.is_global := false;
  END IF;

  IF NEW.is_global AND upper(btrim(NEW.category)) NOT IN ('BROCHURE', 'FLOOR_PLAN') THEN
    RAISE EXCEPTION 'Only brochures and floor plans may be shared with all clients.' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_client_document_audience ON public.client_documents;
CREATE TRIGGER enforce_client_document_audience
  BEFORE INSERT OR UPDATE OF user_id, is_global, category ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_document_audience();