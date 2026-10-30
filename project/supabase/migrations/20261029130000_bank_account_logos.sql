ALTER TABLE public.purchase_payment_accounts
  ADD COLUMN IF NOT EXISTS logo_url text;
