-- ============================================================
--  CRM Pro — WhatsApp Message Queue
--  Run AFTER 20240101000020_whatsapp_templates.sql
--
--  One row per message waiting to be delivered via the
--  WhatsApp Cloud API. The queue processor claims one item at a
--  time, sends it, then records the result. Items are never
--  physically deleted — cancelled / failed rows are kept for
--  auditing and the UI.
-- ============================================================


-- ── 1. Queue table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant anchor
  company_id        UUID        NOT NULL REFERENCES public.companies(id)               ON DELETE CASCADE,

  -- The user who enqueued this message; also used as sent_by when
  -- the message is written to whatsapp_messages on delivery.
  created_by        UUID        NOT NULL REFERENCES auth.users(id)                     ON DELETE CASCADE,

  -- The conversation this message belongs to.
  conversation_id   UUID        NOT NULL REFERENCES public.whatsapp_conversations(id)  ON DELETE CASCADE,

  -- ── Message content ────────────────────────────────────────
  message_type      TEXT        NOT NULL DEFAULT 'text'
                                CHECK (message_type IN ('text', 'template')),

  -- Plain-text body. Required for message_type = 'text'.
  -- For templates this holds the rendered preview (informational only;
  -- the processor always re-renders from the template row).
  body              TEXT        NOT NULL DEFAULT '',

  -- Template reference. Required when message_type = 'template'.
  template_id       UUID        REFERENCES public.whatsapp_templates(id)               ON DELETE SET NULL,

  -- Ordered variable values for {{1}}, {{2}}, … placeholders.
  template_params   JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- ── Scheduling ────────────────────────────────────────────
  -- NULL means "send as soon as possible". A future timestamp
  -- means the processor will skip this item until that time.
  scheduled_at      TIMESTAMPTZ DEFAULT NULL,

  -- ── Processing state ───────────────────────────────────────
  -- Lifecycle:
  --   pending    → processing (claimed by the processor)
  --   processing → sent       (successfully delivered to Meta)
  --   processing → failed     (Meta or network error)
  --   pending    → cancelled  (cancelled by a user before processing)
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN (
                                  'pending', 'processing', 'sent', 'failed', 'cancelled'
                                )),

  -- Number of times this item has been attempted. Incremented when
  -- the processor claims the item.
  attempt_count     INT         NOT NULL DEFAULT 0,

  -- Timestamp set when the processor finishes (success or failure).
  processed_at      TIMESTAMPTZ,

  -- The whatsapp_messages row created on successful delivery.
  result_message_id UUID        REFERENCES public.whatsapp_messages(id)                ON DELETE SET NULL,

  -- Error details populated when status = 'failed'.
  error_code        TEXT,
  error_message     TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 2. Auto-update updated_at ─────────────────────────────────
DROP TRIGGER IF EXISTS whatsapp_queue_set_updated_at
  ON public.whatsapp_queue;
CREATE TRIGGER whatsapp_queue_set_updated_at
  BEFORE UPDATE ON public.whatsapp_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. Indexes ────────────────────────────────────────────────

-- Primary processor query: next pending item to send, oldest first.
-- Partial index over pending rows only keeps it tiny and fast.
CREATE INDEX IF NOT EXISTS idx_wa_queue_pending_created
  ON public.whatsapp_queue(created_at ASC)
  WHERE status = 'pending';

-- Scheduler support: pending items with a scheduled_at.
CREATE INDEX IF NOT EXISTS idx_wa_queue_pending_scheduled
  ON public.whatsapp_queue(scheduled_at ASC)
  WHERE status = 'pending' AND scheduled_at IS NOT NULL;

-- Company inbox view (list all queue items for a company).
CREATE INDEX IF NOT EXISTS idx_wa_queue_company_created
  ON public.whatsapp_queue(company_id, created_at DESC);

-- Conversation-scoped listing.
CREATE INDEX IF NOT EXISTS idx_wa_queue_conversation
  ON public.whatsapp_queue(conversation_id, created_at DESC);

-- Creator index.
CREATE INDEX IF NOT EXISTS idx_wa_queue_created_by
  ON public.whatsapp_queue(created_by);


-- ── 4. Atomic claim function ──────────────────────────────────
-- Used exclusively by the server-side queue processor (service role).
-- Claims the next eligible pending item across ALL companies and
-- returns it, or returns nothing if the queue is empty.
--
-- Uses FOR UPDATE SKIP LOCKED so concurrent processor instances
-- (e.g. after a hot-reload) never double-claim the same row.
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

-- Grant execute to service_role only (the processor uses service-role key).
-- Authenticated users never call this directly.
REVOKE ALL ON FUNCTION public.claim_next_wa_queue_item() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_next_wa_queue_item() TO service_role;


-- ── 5. Row Level Security ─────────────────────────────────────
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;


-- ── 6. RLS Policies ───────────────────────────────────────────

-- SELECT: any company member may view their company's queue.
DROP POLICY IF EXISTS "wa_queue: company members can view"
  ON public.whatsapp_queue;
CREATE POLICY "wa_queue: company members can view"
  ON public.whatsapp_queue FOR SELECT
  USING (company_id = public.get_my_company_id());

-- INSERT: any authenticated company member may enqueue a message.
-- WITH CHECK scopes to their own company and forces created_by = caller.
DROP POLICY IF EXISTS "wa_queue: company members can insert"
  ON public.whatsapp_queue;
CREATE POLICY "wa_queue: company members can insert"
  ON public.whatsapp_queue FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND created_by = auth.uid()
  );

-- UPDATE: the creator may cancel their own pending items;
-- managers and above may cancel any item in the company.
-- The processor uses the service-role key (bypasses RLS).
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

-- DELETE: not permitted — soft-cancel via status = 'cancelled' instead.
-- (No DELETE policy = no deletes from authenticated users.)


-- ── 7. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.whatsapp_queue TO authenticated;
GRANT ALL ON public.whatsapp_queue TO service_role;
