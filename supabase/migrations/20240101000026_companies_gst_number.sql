-- ============================================================
--  CRM Pro — Add gst_number to companies
--
--  ProposalPage selects and displays gst_number on generated
--  PDFs. The column was referenced in code and types but never
--  added to the schema, causing PostgREST to return 400 on every
--  company fetch from the Proposals page.
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS gst_number TEXT DEFAULT NULL;
