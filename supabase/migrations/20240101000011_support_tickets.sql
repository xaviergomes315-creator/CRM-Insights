-- ============================================================
--  CRM Pro — Support Tickets Migration
--  Run AFTER 20240101000010_client_documents.sql
-- ============================================================

-- ── 1. Support Tickets table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Denormalized name avoids a join on every list render
  creator_name  TEXT        NOT NULL DEFAULT '',
  subject       TEXT        NOT NULL,
  description   TEXT        NOT NULL DEFAULT '',
  status        TEXT        NOT NULL DEFAULT 'Open'
                CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed')),
  priority      TEXT        NOT NULL DEFAULT 'Medium'
                CHECK (priority IN ('Low', 'Medium', 'High')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS support_tickets_set_updated_at ON public.support_tickets;
CREATE TRIGGER support_tickets_set_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_support_tickets_company
  ON public.support_tickets(company_id, created_at DESC);


-- ── 2. Support Ticket Messages table ──────────────────────────
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID        NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Denormalized name avoids a join on every message render
  sender_name  TEXT        NOT NULL DEFAULT '',
  message      TEXT        NOT NULL,
  -- true = sent by staff/admin; false = sent by client/member
  is_staff     BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket
  ON public.support_ticket_messages(ticket_id, created_at ASC);


-- ── 3. RLS ────────────────────────────────────────────────────
ALTER TABLE public.support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;


-- ── 4. Policies: support_tickets ──────────────────────────────

-- Any company member can view all tickets for their company
DROP POLICY IF EXISTS "support_tickets: company members can view" ON public.support_tickets;
CREATE POLICY "support_tickets: company members can view"
  ON public.support_tickets FOR SELECT
  USING (company_id = public.get_my_company_id());

-- Any company member can raise a new ticket
DROP POLICY IF EXISTS "support_tickets: members can insert" ON public.support_tickets;
CREATE POLICY "support_tickets: members can insert"
  ON public.support_tickets FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

-- Only admins and managers can update (change status, etc.)
DROP POLICY IF EXISTS "support_tickets: admins can update" ON public.support_tickets;
CREATE POLICY "support_tickets: admins can update"
  ON public.support_tickets FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  )
  WITH CHECK (company_id = public.get_my_company_id());

-- Only admins can delete tickets
DROP POLICY IF EXISTS "support_tickets: admins can delete" ON public.support_tickets;
CREATE POLICY "support_tickets: admins can delete"
  ON public.support_tickets FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );


-- ── 5. Policies: support_ticket_messages ──────────────────────

-- Any company member can read messages for their company's tickets
DROP POLICY IF EXISTS "ticket_messages: company members can view" ON public.support_ticket_messages;
CREATE POLICY "ticket_messages: company members can view"
  ON public.support_ticket_messages FOR SELECT
  USING (company_id = public.get_my_company_id());

-- Any company member can send a message
DROP POLICY IF EXISTS "ticket_messages: members can insert" ON public.support_ticket_messages;
CREATE POLICY "ticket_messages: members can insert"
  ON public.support_ticket_messages FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());


-- ── 6. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.support_tickets         TO authenticated;
GRANT ALL ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_tickets         TO service_role;
GRANT ALL ON public.support_ticket_messages TO service_role;
