CREATE OR REPLACE FUNCTION public.guard_single_unpaid_unit_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.buyer_user_id IS NOT DISTINCT FROM OLD.buyer_user_id
    AND NEW.unit_id IS NOT DISTINCT FROM OLD.unit_id
    AND (NEW.status NOT IN ('RESERVED', 'DEPOSIT_PAID', 'COMPLETED') OR OLD.status IN ('RESERVED', 'DEPOSIT_PAID', 'COMPLETED')) THEN
    RETURN NEW;
  END IF;

  IF NEW.unit_id IS NULL OR NEW.buyer_user_id IS NULL
    OR NEW.status NOT IN ('RESERVED', 'DEPOSIT_PAID', 'COMPLETED') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.buyer_user_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.sales AS existing_sale
    WHERE existing_sale.buyer_user_id = NEW.buyer_user_id
      AND existing_sale.unit_id IS NOT NULL
      AND existing_sale.id IS DISTINCT FROM NEW.id
      AND existing_sale.status IN ('RESERVED', 'DEPOSIT_PAID', 'COMPLETED')
      AND (
        existing_sale.status <> 'RESERVED'
        OR existing_sale.reservation_expires_at IS NULL
        OR existing_sale.reservation_expires_at > clock_timestamp()
      )
      AND (
        existing_sale.sale_price IS NULL
        OR coalesce((
          SELECT sum(payment.amount)
          FROM public.buyer_payments AS payment
          WHERE payment.sale_id = existing_sale.id
        ), 0) < existing_sale.sale_price
      )
  ) THEN
    RAISE EXCEPTION 'Complete the payment for your current unit before purchasing another.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_single_unpaid_unit_purchase_before_write ON public.sales;
CREATE TRIGGER guard_single_unpaid_unit_purchase_before_write
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.guard_single_unpaid_unit_purchase();

REVOKE ALL ON FUNCTION public.guard_single_unpaid_unit_purchase() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_current_unit_purchase()
RETURNS TABLE (
  sale_id uuid,
  unit_id uuid,
  project_id uuid,
  unit_number text,
  sale_price numeric,
  paid_amount numeric,
  status text,
  reservation_expires_at timestamptz,
  purchase_locked boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH purchases AS (
    SELECT
      sale.id AS sale_id,
      sale.unit_id,
      unit.project_id,
      sale.unit_number,
      sale.sale_price,
      coalesce(payment_totals.paid_amount, 0) AS paid_amount,
      sale.status,
      sale.reservation_expires_at,
      (
        sale.status IN ('RESERVED', 'DEPOSIT_PAID', 'COMPLETED')
        AND (sale.status <> 'RESERVED' OR sale.reservation_expires_at IS NULL OR sale.reservation_expires_at > clock_timestamp())
        AND (sale.sale_price IS NULL OR coalesce(payment_totals.paid_amount, 0) < sale.sale_price)
      ) AS has_unpaid_balance,
      sale.created_at
    FROM public.sales AS sale
    JOIN public.project_units AS unit ON unit.id = sale.unit_id
    LEFT JOIN LATERAL (
      SELECT sum(payment.amount) AS paid_amount
      FROM public.buyer_payments AS payment
      WHERE payment.sale_id = sale.id
    ) AS payment_totals ON true
    WHERE sale.buyer_user_id = auth.uid()
      AND sale.unit_id IS NOT NULL
  )
  SELECT
    purchases.sale_id,
    purchases.unit_id,
    purchases.project_id,
    purchases.unit_number,
    purchases.sale_price,
    purchases.paid_amount,
    purchases.status,
    purchases.reservation_expires_at,
    EXISTS (SELECT 1 FROM purchases AS active_purchase WHERE active_purchase.has_unpaid_balance)
  FROM purchases
  ORDER BY purchases.has_unpaid_balance DESC, purchases.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_current_unit_purchase() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_current_unit_purchase() TO authenticated;