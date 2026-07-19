-- ============================================================
--  CRM Pro — Invoices Table Migration
--  Run this AFTER 20240101000001_multi_tenant_rls.sql in the
--  Supabase SQL Editor.
-- ============================================================


-- ── 1. Invoices table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_number TEXT        NOT NULL,
  client_name    TEXT        NOT NULL,
  amount         NUMERIC     NOT NULL CHECK (amount > 0),
  status         TEXT        NOT NULL DEFAULT 'Pending'
                             CHECK (status IN ('Paid', 'Pending', 'Overdue')),
  due_date       DATE        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Invoice numbers must be unique within a company
  CONSTRAINT invoices_number_per_company UNIQUE (company_id, invoice_number)
);

-- Auto-update updated_at on every write
DROP TRIGGER IF EXISTS invoices_set_updated_at ON public.invoices;
CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 2. Row Level Security ─────────────────────────────────────
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;


-- ── 3. RLS Policies ──────────────────────────────────────────

-- SELECT: any authenticated user in the same company
DROP POLICY IF EXISTS "invoices: company members can view" ON public.invoices;
CREATE POLICY "invoices: company members can view"
  ON public.invoices FOR SELECT
  USING (company_id = public.get_my_company_id());

-- INSERT: any authenticated user in the same company
--   WITH CHECK guarantees the inserted row belongs to the caller's tenant;
--   a compromised client cannot insert into another company's invoice list.
DROP POLICY IF EXISTS "invoices: company members can insert" ON public.invoices;
CREATE POLICY "invoices: company members can insert"
  ON public.invoices FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

-- UPDATE: any authenticated user in the same company
--   WITH CHECK prevents moving an invoice to a different tenant.
DROP POLICY IF EXISTS "invoices: company members can update" ON public.invoices;
CREATE POLICY "invoices: company members can update"
  ON public.invoices FOR UPDATE
  USING  (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- DELETE: only admins and managers (matching the pattern used for leads/tasks)
DROP POLICY IF EXISTS "invoices: managers can delete" ON public.invoices;
CREATE POLICY "invoices: managers can delete"
  ON public.invoices FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );


-- ── 4. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
