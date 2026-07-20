-- ============================================================
--  CRM Pro — Proposal Items Migration
--  Run AFTER 20240101000013_proposals.sql
-- ============================================================


-- ── 1. Proposal items table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cascading delete: removing a proposal removes all its line items
  proposal_id   UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,

  service_name  TEXT        NOT NULL,
  description   TEXT        NOT NULL DEFAULT '',

  -- quantity must be > 0 (you cannot have 0 or negative units on a line item)
  quantity      NUMERIC     NOT NULL DEFAULT 1   CHECK (quantity   >  0),
  unit_price    NUMERIC     NOT NULL DEFAULT 0   CHECK (unit_price >= 0),

  -- discount stored as a percentage (0–100)
  discount      NUMERIC     NOT NULL DEFAULT 0   CHECK (discount   >= 0 AND discount <= 100),

  -- per-line tax rate stored as a percentage (e.g. 18 for 18 %)
  tax_rate      NUMERIC     NOT NULL DEFAULT 0   CHECK (tax_rate   >= 0),

  total         NUMERIC     NOT NULL DEFAULT 0   CHECK (total      >= 0),

  -- Controls display order within a proposal; lower value = higher position
  sort_order    INTEGER     NOT NULL DEFAULT 0,

  -- Extensible metadata bag for future attributes without schema changes
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 2. Auto-update updated_at ─────────────────────────────────
DROP TRIGGER IF EXISTS proposal_items_set_updated_at ON public.proposal_items;
CREATE TRIGGER proposal_items_set_updated_at
  BEFORE UPDATE ON public.proposal_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. Indexes ────────────────────────────────────────────────

-- Primary access path: fetch all items for a given proposal, in order
CREATE INDEX IF NOT EXISTS idx_proposal_items_proposal_order
  ON public.proposal_items(proposal_id, sort_order);


-- ── 4. Row Level Security ─────────────────────────────────────
ALTER TABLE public.proposal_items ENABLE ROW LEVEL SECURITY;


-- ── 5. RLS Policies ───────────────────────────────────────────
-- All policies derive authority from the parent proposals table so that
-- proposal_items never bypass the tenant boundary enforced there.

-- SELECT: visible to any member who can see the parent proposal
DROP POLICY IF EXISTS "proposal_items: company members can view" ON public.proposal_items;
CREATE POLICY "proposal_items: company members can view"
  ON public.proposal_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id   = proposal_id
        AND p.company_id = public.get_my_company_id()
    )
  );

-- INSERT: any company member may add items to their company's proposals
DROP POLICY IF EXISTS "proposal_items: company members can insert" ON public.proposal_items;
CREATE POLICY "proposal_items: company members can insert"
  ON public.proposal_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id   = proposal_id
        AND p.company_id = public.get_my_company_id()
    )
  );

-- UPDATE: the proposal's creator or a manager may edit line items
DROP POLICY IF EXISTS "proposal_items: creator or manager can update" ON public.proposal_items;
CREATE POLICY "proposal_items: creator or manager can update"
  ON public.proposal_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id   = proposal_id
        AND p.company_id = public.get_my_company_id()
        AND (
          p.created_by = auth.uid()
          OR public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id   = proposal_id
        AND p.company_id = public.get_my_company_id()
    )
  );

-- DELETE: managers and above only
DROP POLICY IF EXISTS "proposal_items: managers can delete" ON public.proposal_items;
CREATE POLICY "proposal_items: managers can delete"
  ON public.proposal_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id   = proposal_id
        AND p.company_id = public.get_my_company_id()
        AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
    )
  );


-- ── 6. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.proposal_items TO authenticated;
GRANT ALL ON public.proposal_items TO service_role;
