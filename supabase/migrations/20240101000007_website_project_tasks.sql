-- ============================================================
--  CRM Pro — Website Project Tasks Migration
--  Run AFTER 20240101000006_website_projects.sql
-- ============================================================


-- ── 1. Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.website_project_tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES public.website_projects(id) ON DELETE CASCADE,
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_name   TEXT        NOT NULL,
  assigned_to TEXT        NOT NULL DEFAULT '',
  status      TEXT        NOT NULL DEFAULT 'Todo'
                          CHECK (status IN ('Todo', 'In Progress', 'Done')),
  due_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS website_project_tasks_set_updated_at ON public.website_project_tasks;
CREATE TRIGGER website_project_tasks_set_updated_at
  BEFORE UPDATE ON public.website_project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 2. RLS ────────────────────────────────────────────────────
ALTER TABLE public.website_project_tasks ENABLE ROW LEVEL SECURITY;


-- ── 3. Policies ───────────────────────────────────────────────

DROP POLICY IF EXISTS "wpt: company members can view" ON public.website_project_tasks;
CREATE POLICY "wpt: company members can view"
  ON public.website_project_tasks FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "wpt: managers can insert" ON public.website_project_tasks;
CREATE POLICY "wpt: managers can insert"
  ON public.website_project_tasks FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

DROP POLICY IF EXISTS "wpt: managers can update" ON public.website_project_tasks;
CREATE POLICY "wpt: managers can update"
  ON public.website_project_tasks FOR UPDATE
  USING  (company_id = public.get_my_company_id()
          AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager'))
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "wpt: admins can delete" ON public.website_project_tasks;
CREATE POLICY "wpt: admins can delete"
  ON public.website_project_tasks FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );


-- ── 4. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.website_project_tasks TO authenticated;
GRANT ALL ON public.website_project_tasks TO service_role;
