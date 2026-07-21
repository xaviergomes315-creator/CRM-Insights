-- ============================================================
--  Universal Business Foundation — Phase 1
--  Adds business_type, currency_code, and locale to companies.
--
--  Fully backward-compatible:
--    • All three columns are NOT NULL with sensible defaults.
--    • Existing rows are backfilled immediately by ALTER TABLE.
--    • New companies created by onboard_user() receive the
--      defaults automatically — no function change required.
--    • No existing columns, constraints, or RLS policies are
--      modified.
-- ============================================================

-- ── 1. business_type ─────────────────────────────────────────
--  Identifies the kind of business using the CRM.
--  Default: 'agency' (preserves meaning for existing tenants).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'agency';

-- ── 2. currency_code ─────────────────────────────────────────
--  ISO 4217 three-letter currency code used for financial
--  documents (proposals, invoices) and AI-generated content.
--  Default: 'INR' (matches existing platform default context).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR';

-- ── 3. locale ────────────────────────────────────────────────
--  BCP-47 locale tag used for number/date formatting and
--  AI prompt localisation.
--  Default: 'en-IN' (matches existing platform default context).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en-IN';

-- ── 4. Constraints: allowed values ───────────────────────────
--  Checked at DB level to prevent arbitrary strings.
--  Lists cover the business types and currencies surfaced in
--  the Settings UI; extend by adding a new migration when
--  support for additional values is needed.

ALTER TABLE public.companies
  ADD CONSTRAINT companies_business_type_check
    CHECK (business_type IN (
      'agency', 'restaurant', 'gym', 'clinic', 'retail',
      'real_estate', 'manufacturing', 'education', 'finance',
      'hospitality', 'other'
    ));

ALTER TABLE public.companies
  ADD CONSTRAINT companies_currency_code_check
    CHECK (currency_code IN (
      'INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD',
      'AUD', 'CAD', 'JPY', 'CNY', 'MYR', 'THB', 'ZAR'
    ));

ALTER TABLE public.companies
  ADD CONSTRAINT companies_locale_check
    CHECK (locale IN (
      'en-IN', 'en-US', 'en-GB', 'en-AU', 'en-AE',
      'en-SG', 'en-MY', 'en-ZA', 'zh-CN', 'ja-JP',
      'de-DE', 'fr-FR', 'ar-AE', 'th-TH'
    ));

-- ── 5. Grants ─────────────────────────────────────────────────
--  No new tables — existing grants on public.companies already
--  cover authenticated and service_role. Nothing to add.

-- ── 6. Comment ───────────────────────────────────────────────
COMMENT ON COLUMN public.companies.business_type IS
  'Kind of business — drives module defaults and UI labels. See companies_business_type_check for allowed values.';

COMMENT ON COLUMN public.companies.currency_code IS
  'ISO 4217 currency code used for proposals, invoices, and AI prompts.';

COMMENT ON COLUMN public.companies.locale IS
  'BCP-47 locale tag used for number/date formatting and AI prompt localisation.';
