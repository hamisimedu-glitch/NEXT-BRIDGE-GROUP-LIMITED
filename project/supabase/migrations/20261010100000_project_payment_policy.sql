ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS payment_policy text NOT NULL DEFAULT 'INSTALLMENTS_OPTIONAL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_payment_policy_check'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_payment_policy_check
      CHECK (payment_policy IN ('ONE_TIME_ONLY', 'INSTALLMENTS_OPTIONAL'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_project_payment_policy_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  selected_policy text;
  selected_frequency text;
BEGIN
  SELECT project.payment_policy, sale.installment_frequency
  INTO selected_policy, selected_frequency
  FROM public.sales AS sale
  JOIN public.project_units AS unit ON unit.id = sale.unit_id
  JOIN public.projects AS project ON project.id = unit.project_id
  WHERE sale.id = NEW.id;

  IF selected_policy = 'ONE_TIME_ONLY' AND upper(coalesce(selected_frequency, '')) <> 'ONE_TIME' THEN
    RAISE EXCEPTION 'This project requires a one-time payment for its homes.' USING ERRCODE = '22023';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS enforce_project_payment_policy_on_sale ON public.sales;
CREATE CONSTRAINT TRIGGER enforce_project_payment_policy_on_sale
  AFTER INSERT OR UPDATE ON public.sales
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_project_payment_policy_on_sale();

CREATE OR REPLACE FUNCTION public.prevent_incompatible_project_payment_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_policy = 'ONE_TIME_ONLY'
    AND EXISTS (
      SELECT 1
      FROM public.project_units AS unit
      JOIN public.sales AS sale ON sale.unit_id = unit.id
      WHERE unit.project_id = NEW.id
        AND sale.status IN ('RESERVED', 'DEPOSIT_PAID')
        AND upper(coalesce(sale.installment_frequency, '')) <> 'ONE_TIME'
    ) THEN
    RAISE EXCEPTION 'This project has active installment sales; resolve those plans before requiring one-time payment.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_incompatible_project_payment_policy ON public.projects;
CREATE TRIGGER prevent_incompatible_project_payment_policy
  BEFORE UPDATE OF payment_policy ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.prevent_incompatible_project_payment_policy();ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS payment_policy text NOT NULL DEFAULT 'INSTALLMENTS_OPTIONAL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_payment_policy_check'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_payment_policy_check
      CHECK (payment_policy IN ('ONE_TIME_ONLY', 'INSTALLMENTS_OPTIONAL'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_project_payment_policy_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  selected_policy text;
  selected_frequency text;
BEGIN
  SELECT project.payment_policy, sale.installment_frequency
  INTO selected_policy, selected_frequency
  FROM public.sales AS sale
  JOIN public.project_units AS unit ON unit.id = sale.unit_id
  JOIN public.projects AS project ON project.id = unit.project_id
  WHERE sale.id = NEW.id;

  IF selected_policy = 'ONE_TIME_ONLY' AND upper(coalesce(selected_frequency, '')) <> 'ONE_TIME' THEN
    RAISE EXCEPTION 'This project requires a one-time payment for its homes.' USING ERRCODE = '22023';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS enforce_project_payment_policy_on_sale ON public.sales;
CREATE CONSTRAINT TRIGGER enforce_project_payment_policy_on_sale
  AFTER INSERT OR UPDATE ON public.sales
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_project_payment_policy_on_sale();

CREATE OR REPLACE FUNCTION public.prevent_incompatible_project_payment_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_policy = 'ONE_TIME_ONLY'
    AND EXISTS (
      SELECT 1
      FROM public.project_units AS unit
      JOIN public.sales AS sale ON sale.unit_id = unit.id
      WHERE unit.project_id = NEW.id
        AND sale.status IN ('RESERVED', 'DEPOSIT_PAID')
        AND upper(coalesce(sale.installment_frequency, '')) <> 'ONE_TIME'
    ) THEN
    RAISE EXCEPTION 'This project has active installment sales; resolve those plans before requiring one-time payment.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_incompatible_project_payment_policy ON public.projects;
CREATE TRIGGER prevent_incompatible_project_payment_policy
  BEFORE UPDATE OF payment_policy ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.prevent_incompatible_project_payment_policy();