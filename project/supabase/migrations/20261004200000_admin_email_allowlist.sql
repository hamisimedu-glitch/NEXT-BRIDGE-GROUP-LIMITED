CREATE OR REPLACE FUNCTION public.has_dashboard_role(allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'hamisimedu@gmail.com'
      AND role = ANY(allowed_roles)
  );
$$;