-- ============================================================
--  CRM Pro — Admin Settings Migration
--  Run this AFTER 20240101000003_hr_module.sql in the
--  Supabase SQL Editor.
-- ============================================================


-- ── 1. Add address column to companies ───────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS address TEXT;


-- ── 2. pending_invites table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pending_invites (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email       TEXT          NOT NULL,
  role        public.app_role NOT NULL DEFAULT 'employee',
  invited_by  UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  status      TEXT          NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- One pending invite per email per company
  CONSTRAINT pending_invites_company_email_unique UNIQUE (company_id, email)
);


-- ── 3. Row Level Security ─────────────────────────────────────
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;


-- ── 4. RLS Policies: pending_invites ─────────────────────────

-- Any company member can view pending invites for their company
DROP POLICY IF EXISTS "pending_invites: company members can view" ON public.pending_invites;
CREATE POLICY "pending_invites: company members can view"
  ON public.pending_invites FOR SELECT
  USING (company_id = public.get_my_company_id());

-- Only admins can send invites
DROP POLICY IF EXISTS "pending_invites: admins can insert" ON public.pending_invites;
CREATE POLICY "pending_invites: admins can insert"
  ON public.pending_invites FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );

-- Only admins can revoke (delete) invites
DROP POLICY IF EXISTS "pending_invites: admins can delete" ON public.pending_invites;
CREATE POLICY "pending_invites: admins can delete"
  ON public.pending_invites FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );


-- ── 5. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.pending_invites TO authenticated;
GRANT ALL ON public.pending_invites TO service_role;
