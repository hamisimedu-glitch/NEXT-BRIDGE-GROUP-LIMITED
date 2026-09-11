/*
# Promote the existing NBG administrator

This changes the existing authenticated user's dashboard role only. The password
is managed by Supabase Auth and is intentionally not stored in this migration.
*/

UPDATE public.profiles AS profiles
SET role = 'admin'
FROM auth.users AS users
WHERE profiles.id = users.id
  AND lower(users.email) = lower('hamisimedu@gmail.com');

-- Create the profile if the Auth user exists but its profile row is missing.
INSERT INTO public.profiles (id, role)
SELECT users.id, 'admin'
FROM auth.users AS users
WHERE lower(users.email) = lower('hamisimedu@gmail.com')
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles AS profiles WHERE profiles.id = users.id
  );
