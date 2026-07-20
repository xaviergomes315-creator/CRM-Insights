-- ============================================================
--  Call Logs
--  Records every outbound call a telecaller makes to a lead.
--  Follows the same multi-tenant RLS pattern as leads/tasks.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.call_logs (
  id               BIGSERIAL    PRIMARY KEY,
  company_id       UUID         REFERENCES public.companies(id)      ON DELETE CASCADE,
  lead_id          INTEGER      REFERENCES public.leads(id)           ON DELETE SET NULL,
  -- Denormalised for display without a JOIN (lead may be deleted later)
  lead_name        TEXT         NOT NULL DEFAULT '',
  lead_phone       TEXT         NOT NULL DEFAULT '',
  -- The telecaller who made the call
  called_by        UUID         REFERENCES public.user_profiles(id)  ON DELETE SET NULL,
  called_by_name   TEXT         NOT NULL DEFAULT '',
  -- When the call was made (stored as UTC)
  called_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Null when duration was not recorded
  duration_seconds INTEGER,
  -- Constrained to a fixed set of outcomes
  outcome          TEXT         NOT NULL DEFAULT 'No Answer'
                   CHECK (outcome IN (
                     'Interested',
                     'No Answer',
                     'Not Interested',
                     'Callback Requested',
                     'Wrong Number',
                     'Voicemail'
                   )),
  notes            TEXT         NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Index for the most common query patterns
CREATE INDEX IF NOT EXISTS call_logs_company_called_at
  ON public.call_logs (company_id, called_at DESC);

CREATE INDEX IF NOT EXISTS call_logs_called_by
  ON public.call_logs (called_by, called_at DESC);


-- ── Row Level Security ────────────────────────────────────────

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- All company members can read all call logs for their company.
-- (Admins want visibility; scoping to own logs happens in the app layer.)
DROP POLICY IF EXISTS "call_logs: company members can view" ON public.call_logs;
CREATE POLICY "call_logs: company members can view"
  ON public.call_logs FOR SELECT
  USING (company_id = public.get_my_company_id());

-- Any authenticated member can log a call for their company.
DROP POLICY IF EXISTS "call_logs: members can insert" ON public.call_logs;
CREATE POLICY "call_logs: members can insert"
  ON public.call_logs FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

-- The author can edit their own log; managers and above can edit any.
DROP POLICY IF EXISTS "call_logs: author or manager can update" ON public.call_logs;
CREATE POLICY "call_logs: author or manager can update"
  ON public.call_logs FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND (
      called_by = auth.uid()
      OR public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
    )
  )
  WITH CHECK (company_id = public.get_my_company_id());

-- Only managers and above can delete call logs.
DROP POLICY IF EXISTS "call_logs: managers can delete" ON public.call_logs;
CREATE POLICY "call_logs: managers can delete"
  ON public.call_logs FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );


-- ── Grants ────────────────────────────────────────────────────

GRANT ALL ON public.call_logs TO authenticated;
GRANT ALL ON public.call_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.call_logs_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.call_logs_id_seq TO service_role;
