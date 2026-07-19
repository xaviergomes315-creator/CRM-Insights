-- ============================================================
--  CRM Pro — Multi-Tenant Architecture Migration
--  Run this AFTER migration.sql in the Supabase SQL Editor.
--
--  Creates:
--    • app_role ENUM
--    • companies table
--    • user_profiles table (linked to auth.users)
--    • Row Level Security on all tables
--    • Auto-create profile trigger on signup
-- ============================================================


-- ── 1. Role ENUM ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'super_admin',
    'company_admin',
    'manager',
    'employee'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL; -- idempotent: skip if already exists
END $$;


-- ── 2. Companies ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        UNIQUE NOT NULL,        -- e.g. "acme-corp"
  plan       TEXT        NOT NULL DEFAULT 'free' CHECK (plan IN ('free','starter','pro','enterprise')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_set_updated_at ON public.companies;
CREATE TRIGGER companies_set_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. User Profiles ──────────────────────────────────────────
-- Extends auth.users with role + company membership.
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  UUID        REFERENCES public.companies(id) ON DELETE SET NULL,
  full_name   TEXT        NOT NULL DEFAULT '',
  avatar_url  TEXT,
  role        public.app_role NOT NULL DEFAULT 'employee',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS user_profiles_set_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_set_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 4. Add company_id to existing tables ─────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;


-- ── 5. Helper: get caller's company_id ───────────────────────
-- Used inside RLS policies to avoid a subquery per row.
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.user_profiles WHERE id = auth.uid();
$$;

-- Helper: get caller's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;


-- ── 6. Enable Row Level Security ─────────────────────────────
ALTER TABLE public.companies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks         ENABLE ROW LEVEL SECURITY;


-- ── 7. RLS Policies: companies ────────────────────────────────

-- Users can see their own company
DROP POLICY IF EXISTS "companies: members can view own company" ON public.companies;
CREATE POLICY "companies: members can view own company"
  ON public.companies FOR SELECT
  USING (id = public.get_my_company_id());

-- Only super_admin can insert new companies
DROP POLICY IF EXISTS "companies: super_admin can insert" ON public.companies;
CREATE POLICY "companies: super_admin can insert"
  ON public.companies FOR INSERT
  WITH CHECK (public.get_my_role() = 'super_admin');

-- company_admin or super_admin can update their own company record
DROP POLICY IF EXISTS "companies: admin can update own company" ON public.companies;
CREATE POLICY "companies: admin can update own company"
  ON public.companies FOR UPDATE
  USING (
    id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );

-- Only super_admin can delete companies
DROP POLICY IF EXISTS "companies: super_admin can delete" ON public.companies;
CREATE POLICY "companies: super_admin can delete"
  ON public.companies FOR DELETE
  USING (public.get_my_role() = 'super_admin');


-- ── 8. RLS Policies: user_profiles ───────────────────────────

-- Users can always view their own profile
DROP POLICY IF EXISTS "profiles: own profile is always visible" ON public.user_profiles;
CREATE POLICY "profiles: own profile is always visible"
  ON public.user_profiles FOR SELECT
  USING (id = auth.uid());

-- Users in the same company can see each other's profiles
DROP POLICY IF EXISTS "profiles: same-company members can view" ON public.user_profiles;
CREATE POLICY "profiles: same-company members can view"
  ON public.user_profiles FOR SELECT
  USING (company_id = public.get_my_company_id());

-- Users can update their own profile (safe columns only: full_name, avatar_url).
-- WITH CHECK enforces that company_id and role are IMMUTABLE for self-updates,
-- closing the tenant-pivot attack where a user changes their own company_id to
-- gain visibility into another tenant's data via get_my_company_id().
DROP POLICY IF EXISTS "profiles: own profile update" ON public.user_profiles;
CREATE POLICY "profiles: own profile update"
  ON public.user_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- company_id must never change via self-update (tenant immutability)
    AND company_id IS NOT DISTINCT FROM (
      SELECT p.company_id FROM public.user_profiles p WHERE p.id = auth.uid()
    )
    -- role must never change via self-update (no self-escalation)
    AND role = (
      SELECT p.role FROM public.user_profiles p WHERE p.id = auth.uid()
    )
  );

-- company_admin / super_admin can update any profile in their company.
-- WITH CHECK ensures admins cannot move a member out to another tenant.
DROP POLICY IF EXISTS "profiles: admin can update company members" ON public.user_profiles;
CREATE POLICY "profiles: admin can update company members"
  ON public.user_profiles FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  )
  WITH CHECK (
    -- The resulting row must still belong to the same company
    company_id = public.get_my_company_id()
  );

-- The trigger (below) inserts a new profile on signup — no policy needed for INSERT
-- because the trigger runs as SECURITY DEFINER.


-- ── 9. RLS Policies: leads ────────────────────────────────────

DROP POLICY IF EXISTS "leads: company members can view" ON public.leads;
CREATE POLICY "leads: company members can view"
  ON public.leads FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "leads: members can insert into own company" ON public.leads;
CREATE POLICY "leads: members can insert into own company"
  ON public.leads FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "leads: members can update own company leads" ON public.leads;
CREATE POLICY "leads: members can update own company leads"
  ON public.leads FOR UPDATE
  USING (company_id = public.get_my_company_id())
  -- Prevents cross-tenant row move: the new row's company_id must stay
  -- within the caller's tenant, even if the client sends a different UUID.
  WITH CHECK (company_id = public.get_my_company_id());

-- Only managers and above can delete leads
DROP POLICY IF EXISTS "leads: managers can delete" ON public.leads;
CREATE POLICY "leads: managers can delete"
  ON public.leads FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );


-- ── 10. RLS Policies: tasks ───────────────────────────────────

DROP POLICY IF EXISTS "tasks: company members can view" ON public.tasks;
CREATE POLICY "tasks: company members can view"
  ON public.tasks FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "tasks: members can insert into own company" ON public.tasks;
CREATE POLICY "tasks: members can insert into own company"
  ON public.tasks FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "tasks: members can update own company tasks" ON public.tasks;
CREATE POLICY "tasks: members can update own company tasks"
  ON public.tasks FOR UPDATE
  USING (company_id = public.get_my_company_id())
  -- Prevents cross-tenant row move: the new row's company_id must stay
  -- within the caller's tenant, even if the client sends a different UUID.
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "tasks: managers can delete" ON public.tasks;
CREATE POLICY "tasks: managers can delete"
  ON public.tasks FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );


-- ── 11. Trigger: auto-create profile on signup ───────────────
-- Fires when a new row is inserted into auth.users.
-- Creates a bare-minimum user_profiles row so the app can
-- immediately fetch the profile after email confirmation.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER                    -- needs to write to public.user_profiles
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(NEW.email, '@', 1)   -- fallback: username part of email
    ),
    'employee'                        -- default role; promote via admin panel
  )
  ON CONFLICT (id) DO NOTHING;       -- idempotent: won't fail on replay

  RETURN NEW;
END;
$$;

-- Attach to auth.users (Supabase's internal table)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 12. Grants ────────────────────────────────────────────────
-- Revoke blanket anon access set in migration.sql; authenticated
-- users get access through RLS policies above.
REVOKE ALL ON public.leads         FROM anon;
REVOKE ALL ON public.tasks         FROM anon;
GRANT  ALL ON public.companies     TO authenticated;
GRANT  ALL ON public.user_profiles TO authenticated;
GRANT  ALL ON public.leads         TO authenticated;
GRANT  ALL ON public.tasks         TO authenticated;

-- service_role bypasses RLS (used only by backend/admin scripts)
GRANT ALL ON public.companies     TO service_role;
GRANT ALL ON public.user_profiles TO service_role;
GRANT ALL ON public.leads         TO service_role;
GRANT ALL ON public.tasks         TO service_role;
