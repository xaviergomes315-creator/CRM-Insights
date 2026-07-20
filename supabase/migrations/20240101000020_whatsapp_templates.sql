-- ============================================================
--  CRM Pro — WhatsApp Templates
--  Run AFTER 20240101000019_whatsapp_messages.sql
--
--  Stores reusable WhatsApp message templates that must be
--  pre-approved by Meta before they can be sent to contacts
--  outside the 24-hour customer service window.
-- ============================================================


-- ── 1. Templates table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant anchor
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  created_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ── Identity ───────────────────────────────────────────────
  -- Template name as registered with Meta (snake_case, e.g. order_confirmation).
  -- Must be unique within the company because Meta enforces uniqueness
  -- per WhatsApp Business Account.
  name            TEXT        NOT NULL,

  -- Meta template category determines delivery pricing and policy.
  --   AUTHENTICATION — OTPs and verification codes
  --   MARKETING      — promotional messages
  --   UTILITY        — transactional / service notifications
  category        TEXT        NOT NULL DEFAULT 'UTILITY'
                              CHECK (category IN ('AUTHENTICATION', 'MARKETING', 'UTILITY')),

  -- BCP-47 language code (e.g. 'en', 'en_US', 'hi', 'mr').
  language        TEXT        NOT NULL DEFAULT 'en',

  -- ── Approval status ────────────────────────────────────────
  -- Mirrors the Meta approval lifecycle:
  --   draft           — being composed in the CRM, not yet submitted
  --   pending_approval — submitted to Meta, awaiting review
  --   approved        — approved and ready to send
  --   rejected        — rejected by Meta (see rejection_reason)
  --   paused          — approved but rate-limited or quality-paused by Meta
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN (
                                'draft', 'pending_approval',
                                'approved', 'rejected', 'paused'
                              )),

  -- ── Template structure ─────────────────────────────────────
  -- Optional header component
  header_type     TEXT        CHECK (header_type IN ('none', 'text', 'image', 'document', 'video')),

  -- For header_type = 'text': the header text (may contain one {{1}} variable).
  -- For header_type = image / document / video: the example media URL.
  header_content  TEXT,

  -- The main message body. Use {{1}}, {{2}}, … for variable placeholders.
  -- WhatsApp requires at least one non-whitespace character.
  body_text       TEXT        NOT NULL,

  -- Optional footer (plain text, no variables allowed by Meta policy).
  footer_text     TEXT        NOT NULL DEFAULT '',

  -- Call-to-action and quick-reply button definitions stored as a JSON
  -- array following the WhatsApp Cloud API button schema, e.g.:
  --   [{"type":"QUICK_REPLY","text":"Yes"},{"type":"URL","text":"Track","url":"..."}]
  buttons         JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- ── Meta integration ───────────────────────────────────────
  -- The template ID assigned by Meta after submission. NULL until the
  -- template is submitted and acknowledged by the API.
  external_id     TEXT,

  -- Reason provided by Meta when status = 'rejected'.
  rejection_reason TEXT,

  -- Extensible metadata bag (e.g. example variables, tag list, last
  -- sync timestamp from the Meta API) without schema changes.
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Soft delete: preserves the template definition and any messages
  -- sent using it even after it is removed from the UI.
  deleted_at      TIMESTAMPTZ DEFAULT NULL,

  -- Template names must be unique within a company (Meta requirement).
  CONSTRAINT wa_templates_name_per_company UNIQUE (company_id, name)
);


-- ── 2. Auto-update updated_at ─────────────────────────────────
DROP TRIGGER IF EXISTS whatsapp_templates_set_updated_at
  ON public.whatsapp_templates;
CREATE TRIGGER whatsapp_templates_set_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. Indexes ────────────────────────────────────────────────

-- Primary listing query: all active templates for a company
CREATE INDEX IF NOT EXISTS idx_wa_templates_company_created
  ON public.whatsapp_templates(company_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Filter by approval status (e.g. show only approved templates in
-- the send-message picker)
CREATE INDEX IF NOT EXISTS idx_wa_templates_company_status
  ON public.whatsapp_templates(company_id, status)
  WHERE deleted_at IS NULL;

-- Filter by category within a company
CREATE INDEX IF NOT EXISTS idx_wa_templates_company_category
  ON public.whatsapp_templates(company_id, category)
  WHERE deleted_at IS NULL;

-- Meta sync: look up a template by its external Meta ID
CREATE INDEX IF NOT EXISTS idx_wa_templates_external_id
  ON public.whatsapp_templates(external_id)
  WHERE external_id IS NOT NULL;

-- Filter by creator (e.g. "templates I created")
CREATE INDEX IF NOT EXISTS idx_wa_templates_created_by
  ON public.whatsapp_templates(created_by);


-- ── 4. Row Level Security ─────────────────────────────────────
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;


-- ── 5. RLS Policies ───────────────────────────────────────────

-- SELECT: any company member may view non-deleted templates.
-- Employees need to browse approved templates when composing messages.
DROP POLICY IF EXISTS "wa_templates: company members can view"
  ON public.whatsapp_templates;
CREATE POLICY "wa_templates: company members can view"
  ON public.whatsapp_templates FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND deleted_at IS NULL
  );

-- INSERT: managers and above may create templates. Employees cannot
-- author templates as they require coordination with Meta approval.
DROP POLICY IF EXISTS "wa_templates: managers can insert"
  ON public.whatsapp_templates;
CREATE POLICY "wa_templates: managers can insert"
  ON public.whatsapp_templates FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

-- UPDATE: the creator may edit their own draft/rejected templates;
-- managers and above may update any template in their company (e.g.
-- to sync approval status received from the Meta webhook).
-- WITH CHECK prevents tenant pivot.
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

-- DELETE (soft): restricted to admins. Deleting an approved template
-- also removes it from Meta's account, so this is an admin-only action.
-- Standard practice is to soft-delete (set deleted_at) via an UPDATE.
DROP POLICY IF EXISTS "wa_templates: admins can delete"
  ON public.whatsapp_templates;
CREATE POLICY "wa_templates: admins can delete"
  ON public.whatsapp_templates FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  );


-- ── 6. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
