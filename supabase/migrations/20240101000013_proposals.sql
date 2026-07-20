-- ============================================================
--  CRM Pro — Proposals Migration
--  Run AFTER 20240101000012_client_notifications.sql
-- ============================================================


-- ── 1. Proposals table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proposals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Optional link to a lead in the pipeline. SET NULL on lead deletion so
  -- the proposal is not lost if the lead record is removed.
  lead_id         BIGINT      REFERENCES public.leads(id) ON DELETE SET NULL,

  -- Auto-incremented reference number scoped per company (e.g. PRO-001).
  -- The application is responsible for generating a unique value per tenant;
  -- the constraint below enforces uniqueness at the database layer.
  proposal_number TEXT        NOT NULL,

  -- Client details (denormalised so the proposal remains self-contained even
  -- if the underlying lead record changes or is deleted)
  client_name     TEXT        NOT NULL,
  client_email    TEXT        NOT NULL DEFAULT '',
  client_phone    TEXT        NOT NULL DEFAULT '',

  -- Lifecycle status
  status          TEXT        NOT NULL DEFAULT 'Draft'
                              CHECK (status IN ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired')),

  -- Financials (stored as NUMERIC to avoid floating-point rounding)
  subtotal        NUMERIC     NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax             NUMERIC     NOT NULL DEFAULT 0 CHECK (tax     >= 0),
  total           NUMERIC     NOT NULL DEFAULT 0 CHECK (total   >= 0),

  notes           TEXT        NOT NULL DEFAULT '',
  validity_date   DATE,

  created_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Proposal numbers are unique within a company
  CONSTRAINT proposals_number_per_company UNIQUE (company_id, proposal_number)
);


-- ── 2. Auto-update updated_at ─────────────────────────────────
DROP TRIGGER IF EXISTS proposals_set_updated_at ON public.proposals;
CREATE TRIGGER proposals_set_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. Indexes ────────────────────────────────────────────────

-- Primary listing query: all proposals for a company, newest first
CREATE INDEX IF NOT EXISTS idx_proposals_company_created
  ON public.proposals(company_id, created_at DESC);

-- Filter / join by lead
CREATE INDEX IF NOT EXISTS idx_proposals_lead
  ON public.proposals(lead_id)
  WHERE lead_id IS NOT NULL;

-- Filter by status within a company (e.g. all open/sent proposals)
CREATE INDEX IF NOT EXISTS idx_proposals_company_status
  ON public.proposals(company_id, status);

-- Filter by creator (e.g. "my proposals")
CREATE INDEX IF NOT EXISTS idx_proposals_created_by
  ON public.proposals(created_by);


-- ── 4. Row Level Security ─────────────────────────────────────
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;


-- ── 5. RLS Policies ───────────────────────────────────────────

-- SELECT: any authenticated member of the same company may view all proposals
DROP POLICY IF EXISTS "proposals: company members can view" ON public.proposals;
CREATE POLICY "proposals: company members can view"
  ON public.proposals FOR SELECT
  USING (company_id = public.get_my_company_id());

-- INSERT: any authenticated member may create a proposal for their own company.
--   WITH CHECK prevents a client from inserting into another tenant's namespace.
DROP POLICY IF EXISTS "proposals: company members can insert" ON public.proposals;
CREATE POLICY "proposals: company members can insert"
  ON public.proposals FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

-- UPDATE: the original creator may update their own proposals; managers and
--   above may update any proposal in their company (e.g. to change status).
--   WITH CHECK prevents moving a proposal to a different company.
DROP POLICY IF EXISTS "proposals: creator or manager can update" ON public.proposals;
CREATE POLICY "proposals: creator or manager can update"
  ON public.proposals FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
    )
  )
  WITH CHECK (company_id = public.get_my_company_id());

-- DELETE: managers and above only
DROP POLICY IF EXISTS "proposals: managers can delete" ON public.proposals;
CREATE POLICY "proposals: managers can delete"
  ON public.proposals FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );


-- ── 6. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.proposals TO authenticated;
GRANT ALL ON public.proposals TO service_role;
