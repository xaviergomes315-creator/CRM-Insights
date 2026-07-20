-- ============================================================
--  CRM Pro — Client Documents Migration
--  Run AFTER 20240101000009_fix_onboard_user.sql
-- ============================================================

-- ── 1. Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_documents (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT        NOT NULL DEFAULT '',
  file_url     TEXT        NOT NULL,
  file_type    TEXT        NOT NULL DEFAULT 'Other'
               CHECK (file_type IN ('PDF', 'Word', 'Excel', 'Image', 'Other')),
  file_size    BIGINT,                   -- bytes, optional
  uploaded_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_documents_company
  ON public.client_documents(company_id, created_at DESC);


-- ── 2. RLS ────────────────────────────────────────────────────
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;


-- ── 3. Policies ───────────────────────────────────────────────

-- Any company member can view documents shared with their company
DROP POLICY IF EXISTS "client_documents: company members can view" ON public.client_documents;
CREATE POLICY "client_documents: company members can view"
  ON public.client_documents FOR SELECT
  USING (company_id = public.get_my_company_id());

-- Admins and managers can add documents
DROP POLICY IF EXISTS "client_documents: managers can insert" ON public.client_documents;
CREATE POLICY "client_documents: managers can insert"
  ON public.client_documents FOR INSERT
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );

-- Admins and managers can remove documents
DROP POLICY IF EXISTS "client_documents: managers can delete" ON public.client_documents;
CREATE POLICY "client_documents: managers can delete"
  ON public.client_documents FOR DELETE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin', 'manager')
  );


-- ── 4. Grants ─────────────────────────────────────────────────
GRANT ALL ON public.client_documents TO authenticated;
GRANT ALL ON public.client_documents TO service_role;
