-- Migration 029: Sync business_configuration.business_type when companies.business_type changes
-- Fixes HIGH-02: business_configuration.business_type diverges after a Settings update.

-- ── Trigger function ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_business_type_to_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.business_type IS DISTINCT FROM OLD.business_type THEN
    UPDATE public.business_configuration
    SET business_type = NEW.business_type
    WHERE company_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── Trigger (idempotent) ──────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_company_business_type_change ON public.companies;

CREATE TRIGGER on_company_business_type_change
  AFTER UPDATE OF business_type ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_business_type_to_config();
