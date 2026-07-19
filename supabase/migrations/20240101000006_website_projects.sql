-- ============================================================
--  CRM Pro — Website Projects Module Migration
--  Run this AFTER 20240101000005_ensure_profile_fn.sql in the
--  Supabase SQL Editor.
-- ============================================================


-- ── 1. Website Projects table ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.website_projects (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_name  TEXT        NOT NULL,
  client        TEXT        NOT NULL DEFAULT '',
  website_type  TEXT        NOT NULL DEFAULT '',
  status        TEXT        NOT NULL DEFAULT 'Planning'
                            CHECK (status IN ('Planning', 'In Progress', 'Review', 'Completed', 'On Hold')),
  assigned_to   TEXT        NOT NULL DEFAULT '',
  deadline      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS website_projects_set_updated_at ON public.website_projects;
CREATE TRIGGER website_projects_set_updated_at
  BEFORE UPDATE ON public.website_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 2. Row Level Security ─────────────────────────────────────
ALTER TABLE public.website_projects ENABLE ROW LEVEL SECURITY;


-- ── 3. RLS Policies ──────────────────────────────────────────

DROP POLICY IF EXISTS "website_projects: company members can view" ON public.website_projects;
CREATE POLICY "website_projects: company members can view"
  ON public.website_projects FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "website_projects: managers can insert" ON public.website_projects;
CREATE POLICY "website_projects: managers can insert"
  ON public.website_projects FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

DROP POLICY IF EXISTS "website_projects: managers can update" ON public.website_projects;
CREATE POLICY "website_projects: managers can update"
  ON public.website_projects FOR UPDATE
  USING  (company_id = public.get_my_company_id()
          AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager'))
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "website_projects: admins can delete" ON public.website_projects;
CREATE POLICY "website_projects: admins can delete"
  ON public.website_projects FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );


-- ── 4. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.website_projects TO authenticated;
GRANT ALL ON public.website_projects TO service_role;
