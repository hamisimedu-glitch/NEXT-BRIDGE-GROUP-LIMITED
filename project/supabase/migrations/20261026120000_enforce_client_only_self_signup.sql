CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  signup_role text;
BEGIN
  signup_role := CASE
    WHEN lower(btrim(NEW.email)) = 'hamisimedu@gmail.com' THEN 'admin'
    ELSE 'client'
  END;

  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    signup_role,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'phone'
  )
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role,
        full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
        phone = COALESCE(NULLIF(public.profiles.phone, ''), EXCLUDED.phone);

  RETURN NEW;
END;
$$;