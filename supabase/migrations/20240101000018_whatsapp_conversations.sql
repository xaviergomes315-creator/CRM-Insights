-- ============================================================
--  CRM Pro — WhatsApp Conversations
--  Run AFTER 20240101000017_company_branding.sql
--
--  One row per WhatsApp thread between the company and a contact.
--  Messages are stored in the child whatsapp_messages table.
-- ============================================================


-- ── 1. Conversations table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant anchor: every conversation belongs to exactly one company.
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Optional CRM link. SET NULL on lead deletion so the conversation
  -- history is retained even if the underlying lead is removed.
  lead_id         BIGINT      REFERENCES public.leads(id) ON DELETE SET NULL,

  -- Denormalised contact details so the thread is self-contained even
  -- if the lead record changes or is deleted.
  contact_name    TEXT        NOT NULL DEFAULT '',

  -- The full international WhatsApp number (e.g. +919876543210).
  -- Not UNIQUE globally — the same contact may appear across tenants.
  contact_phone   TEXT        NOT NULL,

  -- Conversation lifecycle
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'archived', 'blocked')),

  -- Timestamp of the most recent message; used to sort the inbox by
  -- latest activity without a subquery.
  last_message_at TIMESTAMPTZ,

  -- Extensible metadata bag for future attributes (e.g. WhatsApp
  -- conversation window expiry, opt-in source) without schema changes.
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,

  created_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Soft delete: records are never physically removed.
  -- Setting deleted_at marks the conversation as deleted in the UI
  -- while preserving message history for auditing.
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);


-- ── 2. Auto-update updated_at ─────────────────────────────────
DROP TRIGGER IF EXISTS whatsapp_conversations_set_updated_at
  ON public.whatsapp_conversations;
CREATE TRIGGER whatsapp_conversations_set_updated_at
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. Indexes ────────────────────────────────────────────────

-- Primary inbox query: all active conversations for a company,
-- ordered by most-recent message first.
CREATE INDEX IF NOT EXISTS idx_wa_conversations_company_last_message
  ON public.whatsapp_conversations(company_id, last_message_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

-- Join / filter by CRM lead
CREATE INDEX IF NOT EXISTS idx_wa_conversations_lead
  ON public.whatsapp_conversations(lead_id)
  WHERE lead_id IS NOT NULL;

-- Look up conversations by contact phone (e.g. incoming webhook routing)
CREATE INDEX IF NOT EXISTS idx_wa_conversations_contact_phone
  ON public.whatsapp_conversations(company_id, contact_phone)
  WHERE deleted_at IS NULL;

-- Filter by status within a company (e.g. show only archived threads)
CREATE INDEX IF NOT EXISTS idx_wa_conversations_company_status
  ON public.whatsapp_conversations(company_id, status)
  WHERE deleted_at IS NULL;

-- Filter by creator (e.g. "my conversations")
CREATE INDEX IF NOT EXISTS idx_wa_conversations_created_by
  ON public.whatsapp_conversations(created_by);


-- ── 4. Row Level Security ─────────────────────────────────────
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;


-- ── 5. RLS Policies ───────────────────────────────────────────

-- SELECT: any authenticated member of the same company may view
-- non-deleted conversations.
DROP POLICY IF EXISTS "wa_conversations: company members can view"
  ON public.whatsapp_conversations;
CREATE POLICY "wa_conversations: company members can view"
  ON public.whatsapp_conversations FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND deleted_at IS NULL
  );

-- INSERT: any company member may open a new conversation on behalf
-- of their tenant. WITH CHECK prevents inserting into another tenant.
DROP POLICY IF EXISTS "wa_conversations: company members can insert"
  ON public.whatsapp_conversations;
CREATE POLICY "wa_conversations: company members can insert"
  ON public.whatsapp_conversations FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

-- UPDATE: the creator may update their own conversations; managers
-- and above may update any conversation within the company (e.g.
-- to archive or block a thread). WITH CHECK prevents tenant pivot.
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

-- DELETE (soft): managers and above only. Physically deleting rows is
-- discouraged — use UPDATE to set deleted_at instead. This policy
-- covers hard-delete as a safety net (e.g. admin tooling).
DROP POLICY IF EXISTS "wa_conversations: managers can delete"
  ON public.whatsapp_conversations;
CREATE POLICY "wa_conversations: managers can delete"
  ON public.whatsapp_conversations FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );


-- ── 6. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.whatsapp_conversations TO authenticated;
GRANT ALL ON public.whatsapp_conversations TO service_role;
