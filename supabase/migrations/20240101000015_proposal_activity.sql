-- ============================================================
--  CRM Pro — Proposal Activity Migration
--  Run AFTER 20240101000014_proposal_items.sql
-- ============================================================


-- ── 1. Proposal activity table ────────────────────────────────
-- Immutable audit log: records are written once and never updated.
-- No updated_at column or trigger is needed.
CREATE TABLE IF NOT EXISTS public.proposal_activity (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cascading delete: removing a proposal removes its full audit trail
  proposal_id   UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,

  -- Human-readable action label, e.g. 'status_changed', 'item_added', 'sent'
  action        TEXT        NOT NULL,

  -- Snapshot of the value before the change; NULL on creation events
  old_value     JSONB,

  -- Snapshot of the value after the change; NULL on deletion events
  new_value     JSONB,

  performed_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 2. Indexes ────────────────────────────────────────────────

-- Primary access path: full activity timeline for a proposal, newest first
CREATE INDEX IF NOT EXISTS idx_proposal_activity_proposal_created
  ON public.proposal_activity(proposal_id, created_at DESC);

-- Look up all actions performed by a specific user across proposals
CREATE INDEX IF NOT EXISTS idx_proposal_activity_performed_by
  ON public.proposal_activity(performed_by);


-- ── 3. Row Level Security ─────────────────────────────────────
ALTER TABLE public.proposal_activity ENABLE ROW LEVEL SECURITY;


-- ── 4. RLS Policies ───────────────────────────────────────────
-- All policies derive authority from the parent proposals table so that
-- proposal_activity never bypasses the tenant boundary enforced there.
--
-- UPDATE is intentionally omitted — activity records are immutable once written.
-- DELETE is restricted to company_admin / super_admin to preserve audit integrity.

-- SELECT: any company member who can see the parent proposal may view its activity
DROP POLICY IF EXISTS "proposal_activity: company members can view" ON public.proposal_activity;
CREATE POLICY "proposal_activity: company members can view"
  ON public.proposal_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id       = proposal_id
        AND p.company_id = public.get_my_company_id()
    )
  );

-- INSERT: any company member may append an activity record to their company's proposals
DROP POLICY IF EXISTS "proposal_activity: company members can insert" ON public.proposal_activity;
CREATE POLICY "proposal_activity: company members can insert"
  ON public.proposal_activity FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id       = proposal_id
        AND p.company_id = public.get_my_company_id()
    )
  );

-- DELETE: restricted to admins only to protect audit integrity
--   (managers can delete proposals themselves, but the audit trail is admin-only)
DROP POLICY IF EXISTS "proposal_activity: admins can delete" ON public.proposal_activity;
CREATE POLICY "proposal_activity: admins can delete"
  ON public.proposal_activity FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id       = proposal_id
        AND p.company_id = public.get_my_company_id()
    )
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );


-- ── 5. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.proposal_activity TO authenticated;
GRANT ALL ON public.proposal_activity TO service_role;
