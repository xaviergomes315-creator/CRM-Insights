-- ============================================================
--  ensure_own_profile()
--
--  SECURITY DEFINER function callable by any authenticated user
--  when the on_auth_user_created trigger missed creating their
--  user_profiles row (e.g. user pre-dates the RLS migration or
--  the trigger failed transiently).
--
--  Idempotent — safe to call even when the row already exists.
--  Returns the profile row (existing or just-created).
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_own_profile()
RETURNS SETOF public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER                 -- bypasses RLS so the INSERT always works
SET search_path = public
AS $$
BEGIN
  -- Upsert: insert the row only when it is genuinely missing.
  -- ON CONFLICT (id) DO NOTHING makes this safe to call repeatedly.
  INSERT INTO public.user_profiles (id, full_name, role)
  SELECT
    auth.uid(),
    COALESCE(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      split_part(u.email, '@', 1)   -- fallback: username part of email
    ),
    'employee'::public.app_role    -- default role; promote via admin panel
  FROM auth.users u
  WHERE u.id = auth.uid()
  ON CONFLICT (id) DO NOTHING;

  -- Always return the row so the caller gets the full profile back.
  RETURN QUERY
    SELECT * FROM public.user_profiles WHERE id = auth.uid();
END;
$$;

-- Any authenticated user may call this for their own profile only
-- (auth.uid() is enforced inside the function body).
GRANT EXECUTE ON FUNCTION public.ensure_own_profile() TO authenticated;
