-- ============================================================
--  CRM Pro — WhatsApp Campaigns
--  Run AFTER 20240101000021_whatsapp_queue.sql
--
--  A campaign groups multiple whatsapp_queue items under one
--  record so you can track bulk-send progress (e.g. broadcast
--  a template to 50 contacts). The processor sends items one at
--  a time (existing behaviour); the trigger below keeps the
--  campaign counters in sync automatically.
-- ============================================================


-- ── 1. Campaigns table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant anchor
  company_id      UUID        NOT NULL REFERENCES public.companies(id)   ON DELETE CASCADE,
  created_by      UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,

  name            TEXT        NOT NULL,

  -- ── Message content ────────────────────────────────────────
  message_type    TEXT        NOT NULL DEFAULT 'text'
                              CHECK (message_type IN ('text', 'template')),

  -- For message_type = 'text'
  body            TEXT        NOT NULL DEFAULT '',

  -- For message_type = 'template'
  template_id     UUID        REFERENCES public.whatsapp_templates(id)   ON DELETE SET NULL,
  template_params JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- ── Recipients ─────────────────────────────────────────────
  -- UUIDs of whatsapp_conversations to send to, set at creation.
  -- Enqueued when the campaign is started.
  conversation_ids JSONB      NOT NULL DEFAULT '[]'::jsonb,

  -- ── Scheduling ────────────────────────────────────────────
  -- When set, queue items inherit this scheduled_at so the
  -- processor holds them until that time.
  scheduled_at    TIMESTAMPTZ DEFAULT NULL,

  -- ── Lifecycle ─────────────────────────────────────────────
  --   draft     → campaign created, not yet started
  --   running   → queue items enqueued, processor draining
  --   completed → all items reached a terminal state
  --   cancelled → user cancelled; pending items cancelled too
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN (
                                'draft', 'running', 'completed', 'cancelled'
                              )),

  -- ── Aggregate counters (maintained by trigger) ─────────────
  total_count     INT         NOT NULL DEFAULT 0,
  sent_count      INT         NOT NULL DEFAULT 0,
  failed_count    INT         NOT NULL DEFAULT 0,
  cancelled_count INT         NOT NULL DEFAULT 0,

  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);


-- ── 2. Auto-update updated_at ─────────────────────────────────
DROP TRIGGER IF EXISTS whatsapp_campaigns_set_updated_at
  ON public.whatsapp_campaigns;
CREATE TRIGGER whatsapp_campaigns_set_updated_at
  BEFORE UPDATE ON public.whatsapp_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. Add campaign_id to whatsapp_queue ──────────────────────
-- Nullable — standalone queue items (not part of any campaign)
-- leave this NULL.
ALTER TABLE public.whatsapp_queue
  ADD COLUMN IF NOT EXISTS campaign_id UUID
    REFERENCES public.whatsapp_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_queue_campaign
  ON public.whatsapp_queue(campaign_id)
  WHERE campaign_id IS NOT NULL;


-- ── 4. Campaign stats trigger ──────────────────────────────────
-- Fires after any INSERT or status-change UPDATE on whatsapp_queue.
-- Re-counts terminal-state rows for the linked campaign and marks
-- the campaign 'completed' once no items are left pending/processing.

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
  -- Only relevant when a campaign is linked
  IF NEW.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip on UPDATE when status didn't change
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Re-count all items for this campaign in one pass
  SELECT
    COUNT(*) FILTER (WHERE status IN ('pending', 'processing')),
    COUNT(*) FILTER (WHERE status = 'sent'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO v_pending_count, v_sent_count, v_failed_count, v_cancelled_count
  FROM public.whatsapp_queue
  WHERE campaign_id = NEW.campaign_id;

  -- Read current campaign status so we don't un-cancel a cancelled campaign
  SELECT status
  INTO v_campaign_status
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


-- ── 5. Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wa_campaigns_company_created
  ON public.whatsapp_campaigns(company_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wa_campaigns_status
  ON public.whatsapp_campaigns(company_id, status)
  WHERE deleted_at IS NULL;


-- ── 6. Row Level Security ─────────────────────────────────────
ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;


-- ── 7. RLS Policies ───────────────────────────────────────────

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

-- DELETE: not permitted — soft-cancel via status = 'cancelled' instead.


-- ── 8. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.whatsapp_campaigns TO authenticated;
GRANT ALL ON public.whatsapp_campaigns TO service_role;
