CREATE OR REPLACE FUNCTION public.enforce_single_admin_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_email text;
BEGIN
  SELECT lower(btrim(email))
  INTO account_email
  FROM auth.users
  WHERE id = NEW.id;

  IF account_email = 'hamisimedu@gmail.com' THEN
    NEW.role := 'admin';
  ELSIF NEW.role IN ('admin', 'owner') THEN
    NEW.role := 'client';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_single_admin_identity ON public.profiles;
CREATE TRIGGER enforce_single_admin_identity
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_admin_identity();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    CASE WHEN lower(btrim(NEW.email)) = 'hamisimedu@gmail.com' THEN 'admin' ELSE 'client' END,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'phone'
  )
  ON CONFLICT (id) DO UPDATE
    SET role = CASE WHEN lower(btrim(NEW.email)) = 'hamisimedu@gmail.com' THEN 'admin' ELSE 'client' END,
        full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
        phone = COALESCE(NULLIF(public.profiles.phone, ''), EXCLUDED.phone);

  RETURN NEW;
END;
$$;

UPDATE public.profiles AS profile
SET role = CASE WHEN lower(btrim(account.email)) = 'hamisimedu@gmail.com' THEN 'admin' ELSE 'client' END
FROM auth.users AS account
WHERE account.id = profile.id
  AND (
    (lower(btrim(account.email)) = 'hamisimedu@gmail.com' AND profile.role IS DISTINCT FROM 'admin')
    OR (lower(btrim(account.email)) <> 'hamisimedu@gmail.com' AND profile.role IN ('admin', 'owner'))
  );