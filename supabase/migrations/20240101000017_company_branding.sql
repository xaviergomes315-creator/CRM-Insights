-- ============================================================
--  CRM Pro — Company Branding Fields
--  Adds email, phone, website, and logo_url columns to the
--  companies table so they can be used on generated documents
--  such as proposal PDFs.
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS email    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS website  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;
