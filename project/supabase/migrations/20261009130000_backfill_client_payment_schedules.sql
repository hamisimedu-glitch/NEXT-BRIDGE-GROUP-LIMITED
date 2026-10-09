INSERT INTO public.client_payment_schedule (
  user_id,
  project_id,
  unit_id,
  buyer_installment_id,
  description,
  due_date,
  amount,
  paid_amount,
  status,
  payment_reference,
  transaction_refs
)
SELECT
  coalesce(sale.buyer_user_id, buyer.id),
  unit.project_id,
  sale.unit_id,
  installment.id,
  CASE
    WHEN sale.installment_frequency = 'ONE_TIME' THEN 'One-time payment · Unit ' || coalesce(unit.unit_number, sale.unit_number)
    WHEN installment.installment_number = 1 THEN 'Initial payment · Unit ' || coalesce(unit.unit_number, sale.unit_number)
    ELSE 'Installment ' || (installment.installment_number - 1) || ' · Unit ' || coalesce(unit.unit_number, sale.unit_number)
  END,
  installment.due_date,
  installment.amount,
  least(installment.amount, installment.paid_amount),
  CASE
    WHEN installment.paid_amount >= installment.amount THEN 'PAID'
    WHEN installment.paid_amount > 0 THEN 'PARTIAL'
    WHEN installment.status = 'OVERDUE' THEN 'OVERDUE'
    ELSE 'PENDING'
  END,
  'NBG-PURCHASE-' || upper(replace(sale.id::text, '-', '')),
  coalesce(payment_refs.transaction_refs, '{}'::text[])
FROM public.buyer_installments AS installment
JOIN public.sales AS sale ON sale.id = installment.sale_id
LEFT JOIN public.project_units AS unit ON unit.id = sale.unit_id
LEFT JOIN auth.users AS buyer ON sale.buyer_user_id IS NULL
  AND lower(buyer.email) = lower(sale.buyer_email)
LEFT JOIN LATERAL (
  SELECT array_agg(payment.transaction_ref ORDER BY payment.created_at) AS transaction_refs
  FROM public.buyer_payments AS payment
  WHERE payment.installment_id = installment.id
) AS payment_refs ON true
WHERE coalesce(sale.buyer_user_id, buyer.id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.client_payment_schedule AS schedule
    WHERE schedule.buyer_installment_id = installment.id
  );

NOTIFY pgrst, 'reload schema';