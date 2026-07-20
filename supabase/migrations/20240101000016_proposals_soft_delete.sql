-- ============================================================
--  CRM Pro — Proposals: Soft Delete
--  Run AFTER 20240101000015_proposal_activity.sql
-- ============================================================
--  Adds a deleted_at column to proposals. Records are never
--  physically removed; setting deleted_at marks them as deleted.
--  All SELECT policies are narrowed to exclude soft-deleted rows.
-- ============================================================


-- ── 1. Add column ─────────────────────────────────────────────
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;


-- ── 2. Partial index — fast lookup of non-deleted rows ────────
CREATE INDEX IF NOT EXISTS idx_proposals_active
  ON public.proposals(company_id, created_at DESC)
  WHERE deleted_at IS NULL;


-- ── 3. Narrow proposals SELECT policy ────────────────────────
-- Recreate the existing SELECT policy to filter out soft-deleted rows.
DROP POLICY IF EXISTS "proposals: company members can view" ON public.proposals;
CREATE POLICY "proposals: company members can view"
  ON public.proposals FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND deleted_at IS NULL
  );


-- ── 4. Narrow proposal_items SELECT policy ───────────────────
-- Items for soft-deleted proposals should also become invisible.
DROP POLICY IF EXISTS "proposal_items: company members can view" ON public.proposal_items;
CREATE POLICY "proposal_items: company members can view"
  ON public.proposal_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id         = proposal_id
        AND p.company_id = public.get_my_company_id()
        AND p.deleted_at IS NULL
    )
  );


-- ── 5. Narrow proposal_activity SELECT policy ────────────────
-- Activity for soft-deleted proposals should also become invisible.
DROP POLICY IF EXISTS "proposal_activity: company members can view" ON public.proposal_activity;
CREATE POLICY "proposal_activity: company members can view"
  ON public.proposal_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id         = proposal_id
        AND p.company_id = public.get_my_company_id()
        AND p.deleted_at IS NULL
    )
  );
