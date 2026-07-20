-- ============================================================
--  CRM Pro — Client Notifications Migration
--  Run AFTER 20240101000011_support_tickets.sql
-- ============================================================

-- ── 1. Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- NULL = company-wide broadcast; non-NULL = targeted to a specific user
  user_id      UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  message      TEXT        NOT NULL DEFAULT '',
  type         TEXT        NOT NULL DEFAULT 'info'
               CHECK (type IN ('info', 'success', 'warning', 'alert')),
  is_read      BOOLEAN     NOT NULL DEFAULT false,
  created_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_company_date
  ON public.client_notifications(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON public.client_notifications(user_id)
  WHERE user_id IS NOT NULL;


-- ── 2. RLS ────────────────────────────────────────────────────
ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;


-- ── 3. Policies ───────────────────────────────────────────────

-- Members see company-wide broadcasts (user_id IS NULL) OR their own targeted notifications
DROP POLICY IF EXISTS "notifications: members can view own" ON public.client_notifications;
CREATE POLICY "notifications: members can view own"
  ON public.client_notifications FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Admins and managers can broadcast notifications
DROP POLICY IF EXISTS "notifications: managers can insert" ON public.client_notifications;
CREATE POLICY "notifications: managers can insert"
  ON public.client_notifications FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

-- Members can mark notifications as read (only ones they can see)
DROP POLICY IF EXISTS "notifications: members can update own" ON public.client_notifications;
CREATE POLICY "notifications: members can update own"
  ON public.client_notifications FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND (user_id IS NULL OR user_id = auth.uid())
  )
  WITH CHECK (company_id = public.get_my_company_id());

-- Admins can delete notifications
DROP POLICY IF EXISTS "notifications: admins can delete" ON public.client_notifications;
CREATE POLICY "notifications: admins can delete"
  ON public.client_notifications FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );


-- ── 4. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.client_notifications TO authenticated;
GRANT ALL ON public.client_notifications TO service_role;
