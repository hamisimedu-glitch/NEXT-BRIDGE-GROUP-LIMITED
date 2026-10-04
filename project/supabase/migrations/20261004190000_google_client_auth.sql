CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_role text;
BEGIN
  new_role := CASE
    WHEN NEW.raw_app_meta_data ->> 'provider' = 'google' THEN 'client'
    WHEN NEW.raw_user_meta_data ->> 'role' = 'client' THEN 'client'
    WHEN NEW.raw_user_meta_data ->> 'role' = 'staff' THEN 'staff'
    ELSE 'staff'
  END;

  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    new_role,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'phone'
  )
  ON CONFLICT (id) DO UPDATE
    SET role = COALESCE(EXCLUDED.role, public.profiles.role),
        full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
        phone = COALESCE(NULLIF(public.profiles.phone, ''), EXCLUDED.phone);

  RETURN NEW;
END;
$$;