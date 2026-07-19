-- ============================================================
--  CRM Pro — HR & Operations Module Migration
--  Run this AFTER 20240101000002_invoices.sql in the
--  Supabase SQL Editor.
-- ============================================================


-- ── 1. Employees table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employees (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_name   TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT '',
  join_date   DATE,
  salary_info TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS employees_set_updated_at ON public.employees;
CREATE TRIGGER employees_set_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 2. Attendance table ──────────────────────────────────────
-- company_id is denormalised here so RLS never needs a join.
CREATE TABLE IF NOT EXISTS public.attendance (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id  UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'Present'
                          CHECK (status IN ('Present', 'Absent', 'On-Leave')),
  check_in    TIME,
  check_out   TIME,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One attendance record per employee per day
  CONSTRAINT attendance_employee_date_unique UNIQUE (employee_id, date)
);


-- ── 3. Row Level Security ─────────────────────────────────────
ALTER TABLE public.employees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;


-- ── 4. RLS Policies: employees ────────────────────────────────

DROP POLICY IF EXISTS "employees: company members can view"   ON public.employees;
CREATE POLICY "employees: company members can view"
  ON public.employees FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "employees: managers can insert"        ON public.employees;
CREATE POLICY "employees: managers can insert"
  ON public.employees FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

DROP POLICY IF EXISTS "employees: managers can update"        ON public.employees;
CREATE POLICY "employees: managers can update"
  ON public.employees FOR UPDATE
  USING  (company_id = public.get_my_company_id()
          AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager'))
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "employees: admins can delete"          ON public.employees;
CREATE POLICY "employees: admins can delete"
  ON public.employees FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );


-- ── 5. RLS Policies: attendance ───────────────────────────────

DROP POLICY IF EXISTS "attendance: company members can view"  ON public.attendance;
CREATE POLICY "attendance: company members can view"
  ON public.attendance FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "attendance: managers can insert"       ON public.attendance;
CREATE POLICY "attendance: managers can insert"
  ON public.attendance FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

DROP POLICY IF EXISTS "attendance: managers can update"       ON public.attendance;
CREATE POLICY "attendance: managers can update"
  ON public.attendance FOR UPDATE
  USING  (company_id = public.get_my_company_id()
          AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager'))
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "attendance: admins can delete"         ON public.attendance;
CREATE POLICY "attendance: admins can delete"
  ON public.attendance FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );


-- ── 6. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.employees  TO authenticated;
GRANT ALL ON public.attendance TO authenticated;
GRANT ALL ON public.employees  TO service_role;
GRANT ALL ON public.attendance TO service_role;
