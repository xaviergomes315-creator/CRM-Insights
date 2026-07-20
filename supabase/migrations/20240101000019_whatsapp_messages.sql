-- ============================================================
--  CRM Pro — WhatsApp Messages
--  Run AFTER 20240101000018_whatsapp_conversations.sql
--
--  One row per individual message within a WhatsApp conversation.
--  Tracks direction, delivery status, media, and template usage.
-- ============================================================


-- ── 1. Messages table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent conversation. Cascading delete: removing a conversation
  -- removes all of its messages.
  conversation_id   UUID        NOT NULL
                                REFERENCES public.whatsapp_conversations(id)
                                ON DELETE CASCADE,

  -- Denormalised tenant anchor so RLS can filter by company_id directly
  -- without a join through whatsapp_conversations on every row read.
  company_id        UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- ── Direction ──────────────────────────────────────────────
  -- incoming: received from the contact (customer → company)
  -- outgoing: sent by the company   (company  → customer)
  direction         TEXT        NOT NULL
                                CHECK (direction IN ('incoming', 'outgoing')),

  -- ── Message type ───────────────────────────────────────────
  message_type      TEXT        NOT NULL DEFAULT 'text'
                                CHECK (message_type IN (
                                  'text', 'image', 'document', 'audio',
                                  'video', 'template', 'location', 'sticker'
                                )),

  -- Plain-text body. Empty string for media-only messages.
  body              TEXT        NOT NULL DEFAULT '',

  -- ── Media ──────────────────────────────────────────────────
  -- Populated when message_type is image / document / audio / video.
  media_url         TEXT,
  media_mime_type   TEXT,
  media_filename    TEXT,

  -- ── Template reference ─────────────────────────────────────
  -- Populated when message_type = 'template'. Stores the template name
  -- and variable substitutions used at send time so the rendered message
  -- can be reconstructed even if the template is later edited or deleted.
  template_name     TEXT,
  template_params   JSONB,

  -- ── Delivery status ────────────────────────────────────────
  -- Lifecycle for outgoing messages:
  --   pending → sent → delivered → read
  --   pending → failed  (terminal error)
  -- Incoming messages are set to 'received' immediately on ingestion.
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN (
                                  'pending', 'sent', 'delivered', 'read',
                                  'failed', 'received'
                                )),

  -- Timestamp of the most recent delivery status change; updated by the
  -- WhatsApp webhook handler each time the carrier reports a new state.
  status_updated_at TIMESTAMPTZ,

  -- WhatsApp API error details when status = 'failed'.
  error_code        TEXT,
  error_message     TEXT,

  -- ── External correlation ───────────────────────────────────
  -- The message ID returned by the WhatsApp Cloud API (wamid.*).
  -- Used to correlate outbound messages with inbound status webhooks.
  -- Unique per company to prevent duplicate webhook processing; NULL
  -- for messages not yet acknowledged by the API.
  external_id       TEXT,

  -- ── Authorship ─────────────────────────────────────────────
  -- The CRM user who sent this message. NULL for incoming messages
  -- (direction = 'incoming') which originate from the contact.
  sent_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Enforce that incoming messages have no sender and outgoing messages do.
  CONSTRAINT wa_messages_direction_sent_by CHECK (
    (direction = 'incoming' AND sent_by IS NULL)
    OR (direction = 'outgoing' AND sent_by IS NOT NULL)
  ),

  -- external_id is unique per company when present (prevents duplicate
  -- webhook ingestion for the same WhatsApp message ID).
  CONSTRAINT wa_messages_external_id_company_unique
    UNIQUE (company_id, external_id)
);


-- ── 2. Auto-update updated_at ─────────────────────────────────
DROP TRIGGER IF EXISTS whatsapp_messages_set_updated_at
  ON public.whatsapp_messages;
CREATE TRIGGER whatsapp_messages_set_updated_at
  BEFORE UPDATE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. Indexes ────────────────────────────────────────────────

-- Primary message-thread query: all messages in a conversation,
-- chronologically ordered (oldest first for a chat UI).
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation_created
  ON public.whatsapp_messages(conversation_id, created_at ASC);

-- Company-scoped message feed (e.g. "all recent messages" view,
-- reporting). Relies on the denormalised company_id column.
CREATE INDEX IF NOT EXISTS idx_wa_messages_company_created
  ON public.whatsapp_messages(company_id, created_at DESC);

-- Filter outgoing messages by delivery status within a company
-- (e.g. find all failed or still-pending sends for retry logic).
CREATE INDEX IF NOT EXISTS idx_wa_messages_company_status
  ON public.whatsapp_messages(company_id, status)
  WHERE direction = 'outgoing';

-- Filter by direction within a conversation (e.g. count unread inbound).
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation_direction
  ON public.whatsapp_messages(conversation_id, direction);

-- Webhook correlation: look up a message by its WhatsApp API ID.
-- Partial index — only rows with a known external_id are indexed.
CREATE INDEX IF NOT EXISTS idx_wa_messages_external_id
  ON public.whatsapp_messages(company_id, external_id)
  WHERE external_id IS NOT NULL;

-- Sender index (e.g. "messages sent by this agent").
CREATE INDEX IF NOT EXISTS idx_wa_messages_sent_by
  ON public.whatsapp_messages(sent_by)
  WHERE sent_by IS NOT NULL;


-- ── 4. Row Level Security ─────────────────────────────────────
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;


-- ── 5. RLS Policies ───────────────────────────────────────────
-- All policies derive tenant authority from company_id directly
-- (denormalised) for efficiency; parent conversation access is
-- implicitly enforced because company_id is copied from it on insert.

-- SELECT: any company member may read messages within their tenant.
-- Also excludes messages whose parent conversation is soft-deleted.
DROP POLICY IF EXISTS "wa_messages: company members can view"
  ON public.whatsapp_messages;
CREATE POLICY "wa_messages: company members can view"
  ON public.whatsapp_messages FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id         = conversation_id
        AND c.deleted_at IS NULL
    )
  );

-- INSERT: any company member may record a message into their tenant's
-- conversations. WITH CHECK prevents cross-tenant inserts.
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

-- UPDATE: the sender may update their own outgoing messages (e.g. to
-- patch delivery status from a webhook); managers and above may update
-- any message in the company (e.g. for bulk status reconciliation).
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

-- DELETE: restricted to admins only to preserve conversation integrity.
-- Managers can soft-delete the parent conversation instead.
DROP POLICY IF EXISTS "wa_messages: admins can delete"
  ON public.whatsapp_messages;
CREATE POLICY "wa_messages: admins can delete"
  ON public.whatsapp_messages FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );


-- ── 6. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
