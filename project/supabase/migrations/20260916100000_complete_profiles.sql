-- Complete the client profile contract used by the portal.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS preferred_location text,
  ADD COLUMN IF NOT EXISTS investment_budget text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

GRANT UPDATE (full_name, phone, preferred_location, investment_budget, notes, updated_at) ON public.profiles TO authenticated;
