-- ============================================================
--  CRM Pro — Fix set_updated_at trigger + rewrite onboard_user
--
--  Problems solved:
--    1. set_updated_at() crashes on any UPDATE to user_profiles
--       or companies because neither table has an updated_at column
--       in the live schema. The trigger exists but references a
--       missing field → "record new has no field updated_at".
--    2. onboard_user() (migration 00008) referenced slug/plan
--       columns that do not exist on the live companies table.
--
--  Changes:
--    • Replace set_updated_at() with a safe no-op version that
--      silently skips when updated_at is absent.
--    • Replace onboard_user() to match the real column set:
--        user_profiles : id, company_id, full_name, created_at, role
--        companies     : id, name, gst_number, created_at, address
-- ============================================================


-- ── 1. Safe set_updated_at — never crashes on missing column ──────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    NEW.updated_at = now();
  EXCEPTION WHEN others THEN
    -- updated_at column does not exist on this table; skip silently.
    NULL;
  END;
  RETURN NEW;
END;
$$;


-- ── 2. onboard_user — rewritten for real schema ───────────────────────────────
--
--  user_profiles real columns : id, company_id, full_name, created_at, role
--  companies real columns     : id, name, gst_number, created_at, address
--
--  What it does (idempotent):
--    a) Upserts the user_profiles row (DO NOTHING on conflict to avoid
--       the UPDATE trigger path while the safe version deploys).
--    b) Back-fills full_name via a separate UPDATE when the stored value
--       is blank — avoids a profile showing an empty display name.
--    c) If company_id is NULL, finds or creates a company:
--         • business domain → join existing company by name OR create one
--           and become company_admin.
--         • generic provider → create a personal workspace.
--    d) Guarantees role is never NULL.
--    e) Returns the fully-populated profile row.

CREATE OR REPLACE FUNCTION public.onboard_user()
RETURNS SETOF public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_email        TEXT;
  v_full_name    TEXT;
  v_domain       TEXT;
  v_company_id   UUID;
  v_current_role public.app_role;
  v_new_role     public.app_role;
  v_company_name TEXT;

  GENERIC_DOMAINS TEXT[] := ARRAY[
    'gmail.com',   'googlemail.com',
    'yahoo.com',   'ymail.com',
    'hotmail.com', 'hotmail.co.uk',
    'outlook.com', 'live.com',  'msn.com',
    'icloud.com',  'me.com',    'mac.com',
    'aol.com',
    'protonmail.com', 'proton.me', 'pm.me',
    'mail.com',    'zoho.com',
    'yandex.com',  'yandex.ru'
  ];
BEGIN
  -- ── 0. Resolve caller ───────────────────────────────────────────────────────
  SELECT
    u.email,
    COALESCE(
      NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(u.raw_user_meta_data->>'name'),      ''),
      split_part(u.email, '@', 1)
    )
  INTO v_email, v_full_name
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_uid IS NULL OR v_email IS NULL THEN
    RAISE EXCEPTION 'onboard_user: caller is not authenticated (uid = %)', v_uid;
  END IF;

  -- ── 1. Ensure profile row exists ────────────────────────────────────────────
  --  DO NOTHING on conflict avoids triggering the (now-safe) UPDATE trigger
  --  path; we handle full_name back-fill in a separate UPDATE below.
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (v_uid, v_full_name, 'employee')
  ON CONFLICT (id) DO NOTHING;

  -- Back-fill full_name when it was previously left blank.
  UPDATE public.user_profiles
  SET    full_name = v_full_name
  WHERE  id = v_uid
    AND  TRIM(full_name) = '';

  -- ── 2. Read current state ───────────────────────────────────────────────────
  SELECT company_id, role
  INTO   v_company_id, v_current_role
  FROM   public.user_profiles
  WHERE  id = v_uid;

  -- ── 3. Assign company when missing ─────────────────────────────────────────
  IF v_company_id IS NULL THEN
    v_domain := lower(trim(split_part(v_email, '@', 2)));

    IF NOT (v_domain = ANY(GENERIC_DOMAINS)) THEN
      -- Derive a human-readable company name from the domain root.
      v_company_name := initcap(replace(split_part(v_domain, '.', 1), '-', ' '));

      -- Look for an existing company with that name (case-insensitive).
      SELECT id INTO v_company_id
      FROM   public.companies
      WHERE  lower(name) = lower(v_company_name)
      LIMIT  1;
    END IF;

    IF v_company_id IS NOT NULL THEN
      -- Joining an existing company → employee.
      v_new_role := 'employee';
    ELSE
      -- Create a new company; first user becomes company_admin.
      IF NOT (v_domain = ANY(GENERIC_DOMAINS)) THEN
        INSERT INTO public.companies (name)
        VALUES (v_company_name)
        RETURNING id INTO v_company_id;
      ELSE
        -- Generic provider → personal workspace.
        INSERT INTO public.companies (name)
        VALUES (v_full_name || '''s Workspace')
        RETURNING id INTO v_company_id;
      END IF;
      v_new_role := 'company_admin';
    END IF;

    -- Persist company assignment and role.
    UPDATE public.user_profiles
    SET    company_id = v_company_id,
           role       = v_new_role
    WHERE  id = v_uid;

  -- ── 4. Heal a NULL role on an already-companied profile ────────────────────
  ELSIF v_current_role IS NULL THEN
    UPDATE public.user_profiles
    SET    role = 'employee'
    WHERE  id = v_uid;
  END IF;

  -- ── 5. Return the final row ─────────────────────────────────────────────────
  RETURN QUERY
    SELECT * FROM public.user_profiles WHERE id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.onboard_user() TO authenticated;
