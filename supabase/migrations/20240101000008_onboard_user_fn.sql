-- ============================================================
--  CRM Pro — Idempotent User Onboarding Function
--
--  onboard_user()
--  ─────────────
--  Callable by any authenticated user immediately after sign-in.
--  In a single transaction it:
--    1. Upserts the user_profiles row (creates it if missing,
--       back-fills full_name if it was empty).
--    2. If company_id is NULL, finds or creates a company:
--         • Business domain  → join existing company OR create one
--           and become company_admin.
--         • Generic provider → create a personal workspace and
--           become company_admin.
--    3. Guarantees role is never NULL (defaults to 'employee').
--    4. Returns the fully-populated user_profiles row.
--
--  Idempotent — safe to call on every login; repeated calls are
--  no-ops for users who already have a company and role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.onboard_user()
RETURNS SETOF public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER          -- bypasses RLS so INSERT/UPDATE always work
SET search_path = public
AS $$
DECLARE
  v_uid            UUID := auth.uid();
  v_email          TEXT;
  v_full_name      TEXT;
  v_domain         TEXT;
  v_company_id     UUID;
  v_current_role   public.app_role;
  v_new_role       public.app_role;

  -- Free/generic e-mail providers: domain match creates a personal
  -- workspace rather than a shared company.
  GENERIC_DOMAINS  TEXT[] := ARRAY[
    'gmail.com', 'googlemail.com',
    'yahoo.com', 'ymail.com',
    'hotmail.com', 'hotmail.co.uk',
    'outlook.com', 'live.com', 'msn.com',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com',
    'protonmail.com', 'proton.me', 'pm.me',
    'mail.com', 'zoho.com',
    'yandex.com', 'yandex.ru'
  ];
BEGIN
  -- ── 0. Resolve caller's e-mail + display name ─────────────────────────────
  SELECT
    u.email,
    COALESCE(
      NULLIF(TRIM(u.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(TRIM(u.raw_user_meta_data ->> 'name'),      ''),
      split_part(u.email, '@', 1)
    )
  INTO v_email, v_full_name
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_uid IS NULL OR v_email IS NULL THEN
    RAISE EXCEPTION 'onboard_user: no authenticated user (auth.uid() = %)', v_uid;
  END IF;

  -- ── 1. Upsert profile row ─────────────────────────────────────────────────
  --  • INSERT creates the row with role = 'employee' (default).
  --  • ON CONFLICT back-fills full_name only when it was left blank.
  --  • Role and company_id are never overwritten here (step 3 handles them).
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (v_uid, v_full_name, 'employee')
  ON CONFLICT (id) DO UPDATE
    SET full_name = CASE
          WHEN TRIM(public.user_profiles.full_name) = ''
          THEN EXCLUDED.full_name
          ELSE public.user_profiles.full_name
        END;

  -- ── 2. Read current company + role ───────────────────────────────────────
  SELECT company_id, role
  INTO   v_company_id, v_current_role
  FROM   public.user_profiles
  WHERE  id = v_uid;

  -- ── 3. Assign company if missing ─────────────────────────────────────────
  IF v_company_id IS NULL THEN
    v_domain := lower(trim(split_part(v_email, '@', 2)));

    -- 3a. For business domains, try to find an existing company.
    IF NOT (v_domain = ANY(GENERIC_DOMAINS)) THEN
      SELECT id INTO v_company_id
      FROM   public.companies
      WHERE  slug = regexp_replace(v_domain, '[^a-z0-9]', '-', 'g')
      LIMIT  1;
    END IF;

    IF v_company_id IS NOT NULL THEN
      -- Joining an existing company → employee role
      v_new_role := 'employee';
    ELSE
      -- 3b. Create a new company.
      --     Business domain  → named after domain root, slug = domain.
      --     Generic provider → named "Name's Workspace", slug = user+random.
      INSERT INTO public.companies (name, slug, plan)
      VALUES (
        CASE
          WHEN NOT (v_domain = ANY(GENERIC_DOMAINS))
          THEN initcap(replace(split_part(v_domain, '.', 1), '-', ' '))
          ELSE v_full_name || '''s Workspace'
        END,
        CASE
          WHEN NOT (v_domain = ANY(GENERIC_DOMAINS))
          THEN regexp_replace(v_domain, '[^a-z0-9]', '-', 'g')
          ELSE lower(regexp_replace(
                 split_part(v_email, '@', 1), '[^a-z0-9]', '-', 'g'
               )) || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6)
        END,
        'free'
      )
      RETURNING id INTO v_company_id;

      -- Founder of the company → company_admin
      v_new_role := 'company_admin';
    END IF;

    -- Persist the assigned company and role.
    UPDATE public.user_profiles
    SET    company_id = v_company_id,
           role       = v_new_role
    WHERE  id = v_uid;

  -- ── 4. Heal a NULL role on an existing profile ───────────────────────────
  ELSIF v_current_role IS NULL THEN
    UPDATE public.user_profiles
    SET    role = 'employee'
    WHERE  id = v_uid;
  END IF;

  -- ── 5. Return the final, fully-populated row ──────────────────────────────
  RETURN QUERY
    SELECT * FROM public.user_profiles WHERE id = v_uid;
END;
$$;

-- Any authenticated user may call this for their own record only
-- (auth.uid() is enforced inside the body).
GRANT EXECUTE ON FUNCTION public.onboard_user() TO authenticated;
