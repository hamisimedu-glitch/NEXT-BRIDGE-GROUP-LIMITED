DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

REVOKE INSERT ON TABLE public.profiles FROM anon, authenticated;
