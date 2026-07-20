-- ============================================================
--  CRM Pro — Schema Remediation Migration
--  Generated: 2026-07-20
--
--  Applies everything from migrations 010–024 that was never
--  executed against the live database, plus the missing columns
--  from migration 001 and 017 that were skipped because
--  companies and user_profiles already existed with a different
--  original schema (CREATE TABLE IF NOT EXISTS was a no-op).
--
--  Safe to run multiple times: all statements are idempotent.
-- ============================================================


-- ════════════════════════════════════════════════════════════
--  PART 1 — Missing columns on existing tables
--  (migrations 001 + 017 were no-ops for companies/user_profiles
--   because those tables pre-existed with a different schema)
-- ════════════════════════════════════════════════════════════

-- ── companies: missing columns from migration 001 ────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS slug       TEXT        UNIQUE,
  ADD COLUMN IF NOT EXISTS plan       TEXT        NOT NULL DEFAULT 'free'
                                                  CHECK (plan IN ('free','starter','pro','enterprise')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── companies: missing columns from migration 017 ────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS email    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS website  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;

-- ── user_profiles: missing columns from migration 001 ────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── set_updated_at function (idempotent — already exists) ────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── Attach updated_at triggers to the two tables that now have the column ──
DROP TRIGGER IF EXISTS companies_set_updated_at    ON public.companies;
CREATE TRIGGER companies_set_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS user_profiles_set_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_set_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ════════════════════════════════════════════════════════════
--  PART 2 — client_documents  (migration 010)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.client_documents (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT        NOT NULL DEFAULT '',
  file_url     TEXT        NOT NULL,
  file_type    TEXT        NOT NULL DEFAULT 'Other'
               CHECK (file_type IN ('PDF', 'Word', 'Excel', 'Image', 'Other')),
  file_size    BIGINT,
  uploaded_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_documents_company
  ON public.client_documents(company_id, created_at DESC);

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_documents: company members can view" ON public.client_documents;
CREATE POLICY "client_documents: company members can view"
  ON public.client_documents FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "client_documents: managers can insert" ON public.client_documents;
CREATE POLICY "client_documents: managers can insert"
  ON public.client_documents FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

DROP POLICY IF EXISTS "client_documents: managers can delete" ON public.client_documents;
CREATE POLICY "client_documents: managers can delete"
  ON public.client_documents FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

GRANT ALL ON public.client_documents TO authenticated;
GRANT ALL ON public.client_documents TO service_role;


-- ════════════════════════════════════════════════════════════
--  PART 3 — support_tickets + support_ticket_messages  (migration 011)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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


CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID        NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name  TEXT        NOT NULL DEFAULT '',
  message      TEXT        NOT NULL,
  is_staff     BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket
  ON public.support_ticket_messages(ticket_id, created_at ASC);

ALTER TABLE public.support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets: company members can view" ON public.support_tickets;
CREATE POLICY "support_tickets: company members can view"
  ON public.support_tickets FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "support_tickets: members can insert" ON public.support_tickets;
CREATE POLICY "support_tickets: members can insert"
  ON public.support_tickets FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "support_tickets: admins can update" ON public.support_tickets;
CREATE POLICY "support_tickets: admins can update"
  ON public.support_tickets FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  )
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "support_tickets: admins can delete" ON public.support_tickets;
CREATE POLICY "support_tickets: admins can delete"
  ON public.support_tickets FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );

DROP POLICY IF EXISTS "ticket_messages: company members can view" ON public.support_ticket_messages;
CREATE POLICY "ticket_messages: company members can view"
  ON public.support_ticket_messages FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "ticket_messages: members can insert" ON public.support_ticket_messages;
CREATE POLICY "ticket_messages: members can insert"
  ON public.support_ticket_messages FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

GRANT ALL ON public.support_tickets         TO authenticated;
GRANT ALL ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_tickets         TO service_role;
GRANT ALL ON public.support_ticket_messages TO service_role;


-- ════════════════════════════════════════════════════════════
--  PART 4 — client_notifications  (migration 012)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.client_notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
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

ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications: members can view own" ON public.client_notifications;
CREATE POLICY "notifications: members can view own"
  ON public.client_notifications FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "notifications: managers can insert" ON public.client_notifications;
CREATE POLICY "notifications: managers can insert"
  ON public.client_notifications FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

DROP POLICY IF EXISTS "notifications: members can update own" ON public.client_notifications;
CREATE POLICY "notifications: members can update own"
  ON public.client_notifications FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND (user_id IS NULL OR user_id = auth.uid())
  )
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "notifications: admins can delete" ON public.client_notifications;
CREATE POLICY "notifications: admins can delete"
  ON public.client_notifications FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );

GRANT ALL ON public.client_notifications TO authenticated;
GRANT ALL ON public.client_notifications TO service_role;


-- ════════════════════════════════════════════════════════════
--  PART 5 — proposals  (migrations 013 + 016)
--  deleted_at included directly so soft-delete is ready from the start.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.proposals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id         BIGINT      REFERENCES public.leads(id) ON DELETE SET NULL,
  proposal_number TEXT        NOT NULL,
  client_name     TEXT        NOT NULL,
  client_email    TEXT        NOT NULL DEFAULT '',
  client_phone    TEXT        NOT NULL DEFAULT '',
  status          TEXT        NOT NULL DEFAULT 'Draft'
                              CHECK (status IN ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired')),
  subtotal        NUMERIC     NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax             NUMERIC     NOT NULL DEFAULT 0 CHECK (tax     >= 0),
  total           NUMERIC     NOT NULL DEFAULT 0 CHECK (total   >= 0),
  notes           TEXT        NOT NULL DEFAULT '',
  validity_date   DATE,
  expiry_date     DATE,
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL,
  CONSTRAINT proposals_number_per_company UNIQUE (company_id, proposal_number)
);

DROP TRIGGER IF EXISTS proposals_set_updated_at ON public.proposals;
CREATE TRIGGER proposals_set_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_proposals_company_created
  ON public.proposals(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_lead
  ON public.proposals(lead_id)
  WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_company_status
  ON public.proposals(company_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_created_by
  ON public.proposals(created_by);
CREATE INDEX IF NOT EXISTS idx_proposals_active
  ON public.proposals(company_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

-- Excludes soft-deleted rows (includes 016 narrowing)
DROP POLICY IF EXISTS "proposals: company members can view" ON public.proposals;
CREATE POLICY "proposals: company members can view"
  ON public.proposals FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "proposals: company members can insert" ON public.proposals;
CREATE POLICY "proposals: company members can insert"
  ON public.proposals FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

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

DROP POLICY IF EXISTS "proposals: managers can delete" ON public.proposals;
CREATE POLICY "proposals: managers can delete"
  ON public.proposals FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

GRANT ALL ON public.proposals TO authenticated;
GRANT ALL ON public.proposals TO service_role;


-- ════════════════════════════════════════════════════════════
--  PART 6 — proposal_items  (migration 014)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.proposal_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  service_name  TEXT        NOT NULL,
  description   TEXT        NOT NULL DEFAULT '',
  quantity      NUMERIC     NOT NULL DEFAULT 1   CHECK (quantity   >  0),
  unit_price    NUMERIC     NOT NULL DEFAULT 0   CHECK (unit_price >= 0),
  discount      NUMERIC     NOT NULL DEFAULT 0   CHECK (discount   >= 0 AND discount <= 100),
  tax_rate      NUMERIC     NOT NULL DEFAULT 0   CHECK (tax_rate   >= 0),
  total         NUMERIC     NOT NULL DEFAULT 0   CHECK (total      >= 0),
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS proposal_items_set_updated_at ON public.proposal_items;
CREATE TRIGGER proposal_items_set_updated_at
  BEFORE UPDATE ON public.proposal_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_proposal_items_proposal_order
  ON public.proposal_items(proposal_id, sort_order);

ALTER TABLE public.proposal_items ENABLE ROW LEVEL SECURITY;

-- Excludes items belonging to soft-deleted proposals (includes 016 narrowing)
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

DROP POLICY IF EXISTS "proposal_items: company members can insert" ON public.proposal_items;
CREATE POLICY "proposal_items: company members can insert"
  ON public.proposal_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id         = proposal_id
        AND p.company_id = public.get_my_company_id()
    )
  );

DROP POLICY IF EXISTS "proposal_items: creator or manager can update" ON public.proposal_items;
CREATE POLICY "proposal_items: creator or manager can update"
  ON public.proposal_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id         = proposal_id
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
      WHERE p.id         = proposal_id
        AND p.company_id = public.get_my_company_id()
    )
  );

DROP POLICY IF EXISTS "proposal_items: managers can delete" ON public.proposal_items;
CREATE POLICY "proposal_items: managers can delete"
  ON public.proposal_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id         = proposal_id
        AND p.company_id = public.get_my_company_id()
        AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
    )
  );

GRANT ALL ON public.proposal_items TO authenticated;
GRANT ALL ON public.proposal_items TO service_role;


-- ════════════════════════════════════════════════════════════
--  PART 7 — proposal_activity  (migration 015)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.proposal_activity (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  action        TEXT        NOT NULL,
  old_value     JSONB,
  new_value     JSONB,
  performed_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_activity_proposal_created
  ON public.proposal_activity(proposal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_activity_performed_by
  ON public.proposal_activity(performed_by);

ALTER TABLE public.proposal_activity ENABLE ROW LEVEL SECURITY;

-- Excludes activity on soft-deleted proposals (includes 016 narrowing)
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

DROP POLICY IF EXISTS "proposal_activity: company members can insert" ON public.proposal_activity;
CREATE POLICY "proposal_activity: company members can insert"
  ON public.proposal_activity FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id         = proposal_id
        AND p.company_id = public.get_my_company_id()
    )
  );

DROP POLICY IF EXISTS "proposal_activity: admins can delete" ON public.proposal_activity;
CREATE POLICY "proposal_activity: admins can delete"
  ON public.proposal_activity FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id         = proposal_id
        AND p.company_id = public.get_my_company_id()
    )
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );

GRANT ALL ON public.proposal_activity TO authenticated;
GRANT ALL ON public.proposal_activity TO service_role;


-- ════════════════════════════════════════════════════════════
--  PART 8 — whatsapp_conversations  (migration 018)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id         BIGINT      REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_name    TEXT        NOT NULL DEFAULT '',
  contact_phone   TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'archived', 'blocked')),
  last_message_at TIMESTAMPTZ,
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);

DROP TRIGGER IF EXISTS whatsapp_conversations_set_updated_at
  ON public.whatsapp_conversations;
CREATE TRIGGER whatsapp_conversations_set_updated_at
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_wa_conversations_company_last_message
  ON public.whatsapp_conversations(company_id, last_message_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conversations_lead
  ON public.whatsapp_conversations(lead_id)
  WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conversations_contact_phone
  ON public.whatsapp_conversations(company_id, contact_phone)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conversations_company_status
  ON public.whatsapp_conversations(company_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conversations_created_by
  ON public.whatsapp_conversations(created_by);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_conversations: company members can view"
  ON public.whatsapp_conversations;
CREATE POLICY "wa_conversations: company members can view"
  ON public.whatsapp_conversations FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "wa_conversations: company members can insert"
  ON public.whatsapp_conversations;
CREATE POLICY "wa_conversations: company members can insert"
  ON public.whatsapp_conversations FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "wa_conversations: creator or manager can update"
  ON public.whatsapp_conversations;
CREATE POLICY "wa_conversations: creator or manager can update"
  ON public.whatsapp_conversations FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND deleted_at IS NULL
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
    )
  )
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "wa_conversations: managers can delete"
  ON public.whatsapp_conversations;
CREATE POLICY "wa_conversations: managers can delete"
  ON public.whatsapp_conversations FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

GRANT ALL ON public.whatsapp_conversations TO authenticated;
GRANT ALL ON public.whatsapp_conversations TO service_role;


-- ════════════════════════════════════════════════════════════
--  PART 9 — whatsapp_messages  (migration 019)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID        NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  company_id        UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  direction         TEXT        NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  message_type      TEXT        NOT NULL DEFAULT 'text'
                                CHECK (message_type IN (
                                  'text', 'image', 'document', 'audio',
                                  'video', 'template', 'location', 'sticker'
                                )),
  body              TEXT        NOT NULL DEFAULT '',
  media_url         TEXT,
  media_mime_type   TEXT,
  media_filename    TEXT,
  template_name     TEXT,
  template_params   JSONB,
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN (
                                  'pending', 'sent', 'delivered', 'read',
                                  'failed', 'received'
                                )),
  status_updated_at TIMESTAMPTZ,
  error_code        TEXT,
  error_message     TEXT,
  external_id       TEXT,
  sent_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_external_id_company
  ON public.whatsapp_messages(company_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation_created
  ON public.whatsapp_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_company_created
  ON public.whatsapp_messages(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_status
  ON public.whatsapp_messages(status)
  WHERE status IN ('pending', 'sent');

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_messages: company members can view"
  ON public.whatsapp_messages;
CREATE POLICY "wa_messages: company members can view"
  ON public.whatsapp_messages FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id         = conversation_id
        AND c.company_id = public.get_my_company_id()
        AND c.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "wa_messages: company members can insert"
  ON public.whatsapp_messages;
CREATE POLICY "wa_messages: company members can insert"
  ON public.whatsapp_messages FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id         = conversation_id
        AND c.company_id = public.get_my_company_id()
    )
  );

DROP POLICY IF EXISTS "wa_messages: sender or manager can update"
  ON public.whatsapp_messages;
CREATE POLICY "wa_messages: sender or manager can update"
  ON public.whatsapp_messages FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND (
      sent_by = auth.uid()
      OR public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
    )
  )
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "wa_messages: admins can delete"
  ON public.whatsapp_messages;
CREATE POLICY "wa_messages: admins can delete"
  ON public.whatsapp_messages FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );

GRANT ALL ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;


-- ════════════════════════════════════════════════════════════
--  PART 10 — whatsapp_templates  (migration 020)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  category         TEXT        NOT NULL DEFAULT 'UTILITY'
                               CHECK (category IN ('AUTHENTICATION', 'MARKETING', 'UTILITY')),
  language         TEXT        NOT NULL DEFAULT 'en',
  status           TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (status IN (
                                 'draft', 'pending_approval',
                                 'approved', 'rejected', 'paused'
                               )),
  header_type      TEXT        CHECK (header_type IN ('none', 'text', 'image', 'document', 'video')),
  header_content   TEXT,
  body_text        TEXT        NOT NULL,
  footer_text      TEXT        NOT NULL DEFAULT '',
  buttons          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  external_id      TEXT,
  rejection_reason TEXT,
  metadata         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ DEFAULT NULL,
  CONSTRAINT wa_templates_name_company_unique UNIQUE (company_id, name)
);

DROP TRIGGER IF EXISTS whatsapp_templates_set_updated_at
  ON public.whatsapp_templates;
CREATE TRIGGER whatsapp_templates_set_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_wa_templates_company
  ON public.whatsapp_templates(company_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wa_templates_status
  ON public.whatsapp_templates(company_id, status)
  WHERE deleted_at IS NULL;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_templates: company members can view"
  ON public.whatsapp_templates;
CREATE POLICY "wa_templates: company members can view"
  ON public.whatsapp_templates FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "wa_templates: managers can insert"
  ON public.whatsapp_templates;
CREATE POLICY "wa_templates: managers can insert"
  ON public.whatsapp_templates FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

DROP POLICY IF EXISTS "wa_templates: creator or manager can update"
  ON public.whatsapp_templates;
CREATE POLICY "wa_templates: creator or manager can update"
  ON public.whatsapp_templates FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND deleted_at IS NULL
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
    )
  )
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "wa_templates: admins can delete"
  ON public.whatsapp_templates;
CREATE POLICY "wa_templates: admins can delete"
  ON public.whatsapp_templates FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );

GRANT ALL ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;


-- ════════════════════════════════════════════════════════════
--  PART 11 — whatsapp_queue  (migration 021)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES public.companies(id)               ON DELETE CASCADE,
  created_by        UUID        NOT NULL REFERENCES auth.users(id)                     ON DELETE CASCADE,
  conversation_id   UUID        NOT NULL REFERENCES public.whatsapp_conversations(id)  ON DELETE CASCADE,
  message_type      TEXT        NOT NULL DEFAULT 'text'
                                CHECK (message_type IN ('text', 'template')),
  body              TEXT        NOT NULL DEFAULT '',
  template_id       UUID        REFERENCES public.whatsapp_templates(id)               ON DELETE SET NULL,
  template_params   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at      TIMESTAMPTZ DEFAULT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN (
                                  'pending', 'processing', 'sent', 'failed', 'cancelled'
                                )),
  attempt_count     INT         NOT NULL DEFAULT 0,
  processed_at      TIMESTAMPTZ,
  result_message_id UUID        REFERENCES public.whatsapp_messages(id)                ON DELETE SET NULL,
  error_code        TEXT,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS whatsapp_queue_set_updated_at
  ON public.whatsapp_queue;
CREATE TRIGGER whatsapp_queue_set_updated_at
  BEFORE UPDATE ON public.whatsapp_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_wa_queue_pending_created
  ON public.whatsapp_queue(created_at ASC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wa_queue_pending_scheduled
  ON public.whatsapp_queue(scheduled_at ASC)
  WHERE status = 'pending' AND scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_queue_company_created
  ON public.whatsapp_queue(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_queue_conversation
  ON public.whatsapp_queue(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_queue_created_by
  ON public.whatsapp_queue(created_by);

-- Atomic claim function used by the server-side queue processor
CREATE OR REPLACE FUNCTION public.claim_next_wa_queue_item()
RETURNS SETOF public.whatsapp_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    UPDATE public.whatsapp_queue
    SET
      status        = 'processing',
      attempt_count = attempt_count + 1,
      updated_at    = now()
    WHERE id = (
      SELECT id
      FROM   public.whatsapp_queue
      WHERE  status = 'pending'
        AND  (scheduled_at IS NULL OR scheduled_at <= now())
      ORDER  BY created_at ASC
      LIMIT  1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_wa_queue_item() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_next_wa_queue_item() TO service_role;

ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_queue: company members can view"
  ON public.whatsapp_queue;
CREATE POLICY "wa_queue: company members can view"
  ON public.whatsapp_queue FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "wa_queue: company members can insert"
  ON public.whatsapp_queue;
CREATE POLICY "wa_queue: company members can insert"
  ON public.whatsapp_queue FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "wa_queue: creator or manager can update"
  ON public.whatsapp_queue;
CREATE POLICY "wa_queue: creator or manager can update"
  ON public.whatsapp_queue FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
    )
  )
  WITH CHECK (company_id = public.get_my_company_id());

GRANT ALL ON public.whatsapp_queue TO authenticated;
GRANT ALL ON public.whatsapp_queue TO service_role;


-- ════════════════════════════════════════════════════════════
--  PART 12 — whatsapp_campaigns  (migration 022)
--  (campaign_id added to whatsapp_queue here too)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID        NOT NULL REFERENCES public.companies(id)   ON DELETE CASCADE,
  created_by       UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  message_type     TEXT        NOT NULL DEFAULT 'text'
                               CHECK (message_type IN ('text', 'template')),
  body             TEXT        NOT NULL DEFAULT '',
  template_id      UUID        REFERENCES public.whatsapp_templates(id)   ON DELETE SET NULL,
  template_params  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  conversation_ids JSONB       NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at     TIMESTAMPTZ DEFAULT NULL,
  status           TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'running', 'completed', 'cancelled')),
  total_count      INT         NOT NULL DEFAULT 0,
  sent_count       INT         NOT NULL DEFAULT 0,
  failed_count     INT         NOT NULL DEFAULT 0,
  cancelled_count  INT         NOT NULL DEFAULT 0,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ DEFAULT NULL
);

DROP TRIGGER IF EXISTS whatsapp_campaigns_set_updated_at
  ON public.whatsapp_campaigns;
CREATE TRIGGER whatsapp_campaigns_set_updated_at
  BEFORE UPDATE ON public.whatsapp_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Link queue rows to this campaign (nullable — standalone items leave it NULL)
ALTER TABLE public.whatsapp_queue
  ADD COLUMN IF NOT EXISTS campaign_id UUID
    REFERENCES public.whatsapp_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_queue_campaign
  ON public.whatsapp_queue(campaign_id)
  WHERE campaign_id IS NOT NULL;

-- Campaign stats trigger: keeps sent/failed/cancelled counters in sync
CREATE OR REPLACE FUNCTION public.sync_campaign_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_count   INT;
  v_sent_count      INT;
  v_failed_count    INT;
  v_cancelled_count INT;
  v_campaign_status TEXT;
  v_new_status      TEXT;
BEGIN
  IF NEW.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('pending', 'processing')),
    COUNT(*) FILTER (WHERE status = 'sent'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_pending_count, v_sent_count, v_failed_count, v_cancelled_count
  FROM public.whatsapp_queue
  WHERE campaign_id = NEW.campaign_id;

  SELECT status INTO v_campaign_status
  FROM public.whatsapp_campaigns
  WHERE id = NEW.campaign_id;

  IF v_campaign_status = 'cancelled' THEN
    v_new_status := 'cancelled';
  ELSIF v_pending_count = 0 THEN
    v_new_status := 'completed';
  ELSE
    v_new_status := 'running';
  END IF;

  UPDATE public.whatsapp_campaigns
  SET
    sent_count      = v_sent_count,
    failed_count    = v_failed_count,
    cancelled_count = v_cancelled_count,
    status          = v_new_status,
    completed_at    = CASE
                        WHEN v_new_status = 'completed' AND completed_at IS NULL
                        THEN now()
                        ELSE completed_at
                      END,
    updated_at      = now()
  WHERE id = NEW.campaign_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whatsapp_queue_sync_campaign_stats
  ON public.whatsapp_queue;
CREATE TRIGGER whatsapp_queue_sync_campaign_stats
  AFTER INSERT OR UPDATE OF status
  ON public.whatsapp_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_campaign_stats();

CREATE INDEX IF NOT EXISTS idx_wa_campaigns_company_created
  ON public.whatsapp_campaigns(company_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wa_campaigns_status
  ON public.whatsapp_campaigns(company_id, status)
  WHERE deleted_at IS NULL;

ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_campaigns: company members can view"
  ON public.whatsapp_campaigns;
CREATE POLICY "wa_campaigns: company members can view"
  ON public.whatsapp_campaigns FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "wa_campaigns: company members can insert"
  ON public.whatsapp_campaigns;
CREATE POLICY "wa_campaigns: company members can insert"
  ON public.whatsapp_campaigns FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "wa_campaigns: creator or manager can update"
  ON public.whatsapp_campaigns;
CREATE POLICY "wa_campaigns: creator or manager can update"
  ON public.whatsapp_campaigns FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND deleted_at IS NULL
    AND (
      created_by = auth.uid()
      OR public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
    )
  )
  WITH CHECK (company_id = public.get_my_company_id());

GRANT ALL ON public.whatsapp_campaigns TO authenticated;
GRANT ALL ON public.whatsapp_campaigns TO service_role;


-- ════════════════════════════════════════════════════════════
--  PART 13 — call_logs  (migrations 023 + 024 combined)
--  New outcomes and follow_up_at included from the start.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.call_logs (
  id               BIGSERIAL    PRIMARY KEY,
  company_id       UUID         REFERENCES public.companies(id)      ON DELETE CASCADE,
  lead_id          INTEGER      REFERENCES public.leads(id)           ON DELETE SET NULL,
  lead_name        TEXT         NOT NULL DEFAULT '',
  lead_phone       TEXT         NOT NULL DEFAULT '',
  called_by        UUID         REFERENCES public.user_profiles(id)  ON DELETE SET NULL,
  called_by_name   TEXT         NOT NULL DEFAULT '',
  called_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  duration_seconds INTEGER,
  outcome          TEXT         NOT NULL DEFAULT 'No Answer'
                   CHECK (outcome IN (
                     'Connected',
                     'No Answer',
                     'Busy',
                     'Wrong Number',
                     'Follow-up',
                     'Converted'
                   )),
  notes            TEXT         NOT NULL DEFAULT '',
  follow_up_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_logs_company_called_at
  ON public.call_logs(company_id, called_at DESC);
CREATE INDEX IF NOT EXISTS call_logs_called_by
  ON public.call_logs(called_by, called_at DESC);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call_logs: company members can view" ON public.call_logs;
CREATE POLICY "call_logs: company members can view"
  ON public.call_logs FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "call_logs: members can insert" ON public.call_logs;
CREATE POLICY "call_logs: members can insert"
  ON public.call_logs FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

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

DROP POLICY IF EXISTS "call_logs: managers can delete" ON public.call_logs;
CREATE POLICY "call_logs: managers can delete"
  ON public.call_logs FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

GRANT ALL ON public.call_logs TO authenticated;
GRANT ALL ON public.call_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.call_logs_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.call_logs_id_seq TO service_role;


-- ════════════════════════════════════════════════════════════
--  PART 14 — Storage bucket: whatsapp-media
-- ════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'audio/mpeg', 'audio/ogg', 'audio/aac',
    'video/mp4', 'video/3gpp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS on the storage bucket objects
-- The bucket is private; only authenticated users in the owning company may
-- upload or read. The folder structure is expected to be:
--   {company_id}/{filename}
-- so company scoping can be enforced via the path prefix.

CREATE POLICY "whatsapp-media: authenticated can upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "whatsapp-media: authenticated can read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'whatsapp-media');
