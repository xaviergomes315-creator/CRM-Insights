-- ============================================================
--  Universal Business Configuration Engine
--
--  Creates: business_configuration table
--    • One row per company, keyed on company_id (UNIQUE).
--    • Stores enabled_modules, dashboard_layout, feature_flags,
--      branding, and ai_configuration as JSONB blobs.
--
--  Automation:
--    • A SECURITY DEFINER trigger fires AFTER INSERT on
--      companies and inserts a type-appropriate default row.
--    • Existing companies are backfilled immediately.
--
--  Backward compatibility:
--    • No existing tables, columns, or RLS policies are modified.
--    • The trigger uses IF NOT EXISTS logic (idempotent).
-- ============================================================


-- ── 1. Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_configuration (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL
                              REFERENCES public.companies(id) ON DELETE CASCADE,
  business_type   TEXT        NOT NULL DEFAULT 'agency',
  enabled_modules JSONB       NOT NULL DEFAULT '{}',
  dashboard_layout JSONB      NOT NULL DEFAULT '{}',
  feature_flags   JSONB       NOT NULL DEFAULT '{}',
  branding        JSONB       NOT NULL DEFAULT '{}',
  ai_configuration JSONB      NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_configuration_company_id_key UNIQUE (company_id)
);

-- Auto-update updated_at (reuses the safe trigger function from migration 009)
DROP TRIGGER IF EXISTS business_configuration_set_updated_at
  ON public.business_configuration;
CREATE TRIGGER business_configuration_set_updated_at
  BEFORE UPDATE ON public.business_configuration
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 2. Default-config generator function ─────────────────────────────────────
--
--  Returns a fully-populated default JSONB configuration for the given
--  business_type.  Callers receive a single object with five top-level keys:
--    enabled_modules  — which app modules are switched on
--    dashboard_layout — widget list and default view
--    feature_flags    — boolean feature toggles
--    branding         — colour/typography hints for generated documents
--    ai_configuration — persona, tone, and industry context for AI prompts

CREATE OR REPLACE FUNCTION public.default_business_config(p_business_type TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_business_type

    -- ── Agency (full-featured default) ──────────────────────────────────────
    WHEN 'agency' THEN jsonb_build_object(
      'enabled_modules', jsonb_build_object(
        'leads',           true,  'pipeline',       true,  'proposals',      true,
        'invoices',        true,  'whatsapp',        true,  'calls',          true,
        'hr',              true,  'tasks',           true,  'documents',      true,
        'client_portal',   true,  'support_tickets', true,  'website_projects', true,
        'analytics',       true,  'social_media',    true
      ),
      'dashboard_layout', jsonb_build_object(
        'default_view', 'leads',
        'widgets', jsonb_build_array(
          'lead_funnel', 'recent_proposals', 'task_summary',
          'revenue_chart', 'whatsapp_activity'
        )
      ),
      'feature_flags', jsonb_build_object(
        'ai_proposals',        true,  'ai_lead_scoring',    true,
        'whatsapp_campaigns',  true,  'email_campaigns',    true,
        'client_portal',       true,  'multi_currency',     false,
        'advanced_analytics',  true
      ),
      'branding', jsonb_build_object(
        'primary_color',   '#6366f1',
        'secondary_color', '#8b5cf6',
        'accent_color',    '#06b6d4',
        'logo_position',   'left',
        'font_family',     'Inter'
      ),
      'ai_configuration', jsonb_build_object(
        'persona',                 'digital agency consultant',
        'tone',                    'professional',
        'language_style',          'concise and action-oriented',
        'proposal_template_hint',  'Focus on deliverables, timelines, and measurable ROI',
        'industry_context',        'Digital marketing, web development, creative services'
      )
    )

    -- ── Restaurant ──────────────────────────────────────────────────────────
    WHEN 'restaurant' THEN jsonb_build_object(
      'enabled_modules', jsonb_build_object(
        'leads',           true,  'pipeline',       false, 'proposals',      false,
        'invoices',        true,  'whatsapp',        true,  'calls',          true,
        'hr',              true,  'tasks',           true,  'documents',      false,
        'client_portal',   false, 'support_tickets', true,  'website_projects', false,
        'analytics',       true,  'social_media',    true
      ),
      'dashboard_layout', jsonb_build_object(
        'default_view', 'analytics',
        'widgets', jsonb_build_array(
          'daily_orders', 'revenue_chart', 'whatsapp_activity',
          'staff_overview', 'support_tickets'
        )
      ),
      'feature_flags', jsonb_build_object(
        'ai_proposals',        false, 'ai_lead_scoring',    false,
        'whatsapp_campaigns',  true,  'email_campaigns',    true,
        'client_portal',       false, 'multi_currency',     false,
        'advanced_analytics',  true
      ),
      'branding', jsonb_build_object(
        'primary_color',   '#dc2626',
        'secondary_color', '#f97316',
        'accent_color',    '#fbbf24',
        'logo_position',   'center',
        'font_family',     'Inter'
      ),
      'ai_configuration', jsonb_build_object(
        'persona',                 'hospitality and food-service business advisor',
        'tone',                    'friendly',
        'language_style',          'warm, approachable, and service-oriented',
        'proposal_template_hint',  'Emphasise quality, ambience, and guest experience',
        'industry_context',        'Food service, restaurant operations, dining experiences'
      )
    )

    -- ── Gym ─────────────────────────────────────────────────────────────────
    WHEN 'gym' THEN jsonb_build_object(
      'enabled_modules', jsonb_build_object(
        'leads',           true,  'pipeline',       true,  'proposals',      false,
        'invoices',        true,  'whatsapp',        true,  'calls',          true,
        'hr',              true,  'tasks',           true,  'documents',      false,
        'client_portal',   true,  'support_tickets', true,  'website_projects', false,
        'analytics',       true,  'social_media',    true
      ),
      'dashboard_layout', jsonb_build_object(
        'default_view', 'leads',
        'widgets', jsonb_build_array(
          'member_pipeline', 'revenue_chart', 'whatsapp_activity',
          'task_summary', 'support_tickets'
        )
      ),
      'feature_flags', jsonb_build_object(
        'ai_proposals',        false, 'ai_lead_scoring',    true,
        'whatsapp_campaigns',  true,  'email_campaigns',    true,
        'client_portal',       true,  'multi_currency',     false,
        'advanced_analytics',  true
      ),
      'branding', jsonb_build_object(
        'primary_color',   '#16a34a',
        'secondary_color', '#15803d',
        'accent_color',    '#facc15',
        'logo_position',   'left',
        'font_family',     'Inter'
      ),
      'ai_configuration', jsonb_build_object(
        'persona',                 'fitness and wellness business consultant',
        'tone',                    'motivational',
        'language_style',          'energetic, encouraging, and results-focused',
        'proposal_template_hint',  'Highlight membership benefits, results, and transformation',
        'industry_context',        'Fitness, gym memberships, personal training, wellness'
      )
    )

    -- ── Clinic ──────────────────────────────────────────────────────────────
    WHEN 'clinic' THEN jsonb_build_object(
      'enabled_modules', jsonb_build_object(
        'leads',           true,  'pipeline',       true,  'proposals',      false,
        'invoices',        true,  'whatsapp',        true,  'calls',          true,
        'hr',              true,  'tasks',           true,  'documents',      true,
        'client_portal',   true,  'support_tickets', true,  'website_projects', false,
        'analytics',       true,  'social_media',    false
      ),
      'dashboard_layout', jsonb_build_object(
        'default_view', 'leads',
        'widgets', jsonb_build_array(
          'patient_pipeline', 'appointment_summary', 'task_summary',
          'revenue_chart', 'document_activity'
        )
      ),
      'feature_flags', jsonb_build_object(
        'ai_proposals',        false, 'ai_lead_scoring',    true,
        'whatsapp_campaigns',  true,  'email_campaigns',    true,
        'client_portal',       true,  'multi_currency',     false,
        'advanced_analytics',  true
      ),
      'branding', jsonb_build_object(
        'primary_color',   '#0891b2',
        'secondary_color', '#0e7490',
        'accent_color',    '#6366f1',
        'logo_position',   'left',
        'font_family',     'Inter'
      ),
      'ai_configuration', jsonb_build_object(
        'persona',                 'healthcare practice management advisor',
        'tone',                    'formal',
        'language_style',          'clear, empathetic, and medically sensitive',
        'proposal_template_hint',  'Emphasise patient care, outcomes, and confidentiality',
        'industry_context',        'Healthcare, medical clinic, patient management'
      )
    )

    -- ── Manufacturing ────────────────────────────────────────────────────────
    WHEN 'manufacturing' THEN jsonb_build_object(
      'enabled_modules', jsonb_build_object(
        'leads',           true,  'pipeline',       true,  'proposals',      true,
        'invoices',        true,  'whatsapp',        false, 'calls',          true,
        'hr',              true,  'tasks',           true,  'documents',      true,
        'client_portal',   false, 'support_tickets', true,  'website_projects', false,
        'analytics',       true,  'social_media',    false
      ),
      'dashboard_layout', jsonb_build_object(
        'default_view', 'pipeline',
        'widgets', jsonb_build_array(
          'lead_funnel', 'recent_proposals', 'task_summary',
          'revenue_chart', 'document_activity'
        )
      ),
      'feature_flags', jsonb_build_object(
        'ai_proposals',        true,  'ai_lead_scoring',    true,
        'whatsapp_campaigns',  false, 'email_campaigns',    true,
        'client_portal',       false, 'multi_currency',     true,
        'advanced_analytics',  true
      ),
      'branding', jsonb_build_object(
        'primary_color',   '#1e40af',
        'secondary_color', '#1d4ed8',
        'accent_color',    '#f59e0b',
        'logo_position',   'left',
        'font_family',     'Inter'
      ),
      'ai_configuration', jsonb_build_object(
        'persona',                 'industrial and manufacturing business advisor',
        'tone',                    'formal',
        'language_style',          'precise, technical, and specification-driven',
        'proposal_template_hint',  'Include capacity, lead times, quality certifications, and MOQ',
        'industry_context',        'Manufacturing, production, supply chain, B2B industrial sales'
      )
    )

    -- ── Retail ──────────────────────────────────────────────────────────────
    WHEN 'retail' THEN jsonb_build_object(
      'enabled_modules', jsonb_build_object(
        'leads',           true,  'pipeline',       false, 'proposals',      false,
        'invoices',        true,  'whatsapp',        true,  'calls',          true,
        'hr',              true,  'tasks',           true,  'documents',      false,
        'client_portal',   false, 'support_tickets', true,  'website_projects', false,
        'analytics',       true,  'social_media',    true
      ),
      'dashboard_layout', jsonb_build_object(
        'default_view', 'analytics',
        'widgets', jsonb_build_array(
          'sales_overview', 'revenue_chart', 'whatsapp_activity',
          'support_tickets', 'task_summary'
        )
      ),
      'feature_flags', jsonb_build_object(
        'ai_proposals',        false, 'ai_lead_scoring',    false,
        'whatsapp_campaigns',  true,  'email_campaigns',    true,
        'client_portal',       false, 'multi_currency',     false,
        'advanced_analytics',  true
      ),
      'branding', jsonb_build_object(
        'primary_color',   '#be185d',
        'secondary_color', '#db2777',
        'accent_color',    '#f97316',
        'logo_position',   'center',
        'font_family',     'Inter'
      ),
      'ai_configuration', jsonb_build_object(
        'persona',                 'retail and e-commerce business advisor',
        'tone',                    'friendly',
        'language_style',          'conversational, persuasive, and customer-centric',
        'proposal_template_hint',  'Highlight product value, promotions, and customer experience',
        'industry_context',        'Retail, e-commerce, consumer goods, customer service'
      )
    )

    -- ── Real Estate ─────────────────────────────────────────────────────────
    WHEN 'real_estate' THEN jsonb_build_object(
      'enabled_modules', jsonb_build_object(
        'leads',           true,  'pipeline',       true,  'proposals',      true,
        'invoices',        true,  'whatsapp',        true,  'calls',          true,
        'hr',              false, 'tasks',           true,  'documents',      true,
        'client_portal',   true,  'support_tickets', false, 'website_projects', false,
        'analytics',       true,  'social_media',    true
      ),
      'dashboard_layout', jsonb_build_object(
        'default_view', 'pipeline',
        'widgets', jsonb_build_array(
          'property_pipeline', 'recent_proposals', 'whatsapp_activity',
          'task_summary', 'revenue_chart'
        )
      ),
      'feature_flags', jsonb_build_object(
        'ai_proposals',        true,  'ai_lead_scoring',    true,
        'whatsapp_campaigns',  true,  'email_campaigns',    true,
        'client_portal',       true,  'multi_currency',     false,
        'advanced_analytics',  true
      ),
      'branding', jsonb_build_object(
        'primary_color',   '#0f766e',
        'secondary_color', '#0d9488',
        'accent_color',    '#d97706',
        'logo_position',   'left',
        'font_family',     'Inter'
      ),
      'ai_configuration', jsonb_build_object(
        'persona',                 'real estate sales and property advisor',
        'tone',                    'professional',
        'language_style',          'persuasive, location-aware, and investment-focused',
        'proposal_template_hint',  'Include property specs, location advantages, ROI, and payment plans',
        'industry_context',        'Real estate, property sales, leasing, site visits'
      )
    )

    -- ── Fallback for any unrecognised type ───────────────────────────────────
    ELSE jsonb_build_object(
      'enabled_modules', jsonb_build_object(
        'leads',           true,  'pipeline',       true,  'proposals',      true,
        'invoices',        true,  'whatsapp',        true,  'calls',          true,
        'hr',              false, 'tasks',           true,  'documents',      false,
        'client_portal',   false, 'support_tickets', true,  'website_projects', false,
        'analytics',       true,  'social_media',    false
      ),
      'dashboard_layout', jsonb_build_object(
        'default_view', 'leads',
        'widgets', jsonb_build_array('lead_funnel', 'task_summary', 'revenue_chart')
      ),
      'feature_flags', jsonb_build_object(
        'ai_proposals',        false, 'ai_lead_scoring',    false,
        'whatsapp_campaigns',  false, 'email_campaigns',    true,
        'client_portal',       false, 'multi_currency',     false,
        'advanced_analytics',  false
      ),
      'branding', jsonb_build_object(
        'primary_color',   '#6366f1',
        'secondary_color', '#8b5cf6',
        'accent_color',    '#06b6d4',
        'logo_position',   'left',
        'font_family',     'Inter'
      ),
      'ai_configuration', jsonb_build_object(
        'persona',                 'business advisor',
        'tone',                    'professional',
        'language_style',          'clear and concise',
        'proposal_template_hint',  'Focus on value delivered and expected outcomes',
        'industry_context',        'General business operations'
      )
    )

  END; -- CASE
END;
$$;


-- ── 3. Trigger function ───────────────────────────────────────────────────────
--
--  Fires AFTER INSERT on public.companies.
--  Inserts a default business_configuration row for the new company.
--  Uses ON CONFLICT DO NOTHING so it is idempotent (safe on replay).

CREATE OR REPLACE FUNCTION public.create_default_business_configuration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg JSONB;
BEGIN
  cfg := public.default_business_config(COALESCE(NEW.business_type, 'agency'));

  INSERT INTO public.business_configuration (
    company_id,
    business_type,
    enabled_modules,
    dashboard_layout,
    feature_flags,
    branding,
    ai_configuration
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.business_type, 'agency'),
    cfg -> 'enabled_modules',
    cfg -> 'dashboard_layout',
    cfg -> 'feature_flags',
    cfg -> 'branding',
    cfg -> 'ai_configuration'
  )
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_company_created_init_config ON public.companies;
CREATE TRIGGER on_company_created_init_config
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.create_default_business_configuration();


-- ── 4. Backfill existing companies ───────────────────────────────────────────
--
--  For every company that already exists (created before this migration),
--  insert a default configuration if one does not yet exist.
--  Uses the same default_business_config() function so seeds are consistent.

INSERT INTO public.business_configuration (
  company_id,
  business_type,
  enabled_modules,
  dashboard_layout,
  feature_flags,
  branding,
  ai_configuration
)
SELECT
  c.id,
  COALESCE(c.business_type, 'agency'),
  public.default_business_config(COALESCE(c.business_type, 'agency')) -> 'enabled_modules',
  public.default_business_config(COALESCE(c.business_type, 'agency')) -> 'dashboard_layout',
  public.default_business_config(COALESCE(c.business_type, 'agency')) -> 'feature_flags',
  public.default_business_config(COALESCE(c.business_type, 'agency')) -> 'branding',
  public.default_business_config(COALESCE(c.business_type, 'agency')) -> 'ai_configuration'
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_configuration bc WHERE bc.company_id = c.id
)
ON CONFLICT (company_id) DO NOTHING;


-- ── 5. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.business_configuration ENABLE ROW LEVEL SECURITY;

-- Company members can read their own configuration.
DROP POLICY IF EXISTS "biz_config: members can view own" ON public.business_configuration;
CREATE POLICY "biz_config: members can view own"
  ON public.business_configuration FOR SELECT
  USING (company_id = public.get_my_company_id());

-- company_admin and super_admin can update their own configuration.
DROP POLICY IF EXISTS "biz_config: admin can update own" ON public.business_configuration;
CREATE POLICY "biz_config: admin can update own"
  ON public.business_configuration FOR UPDATE
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() IN ('super_admin', 'company_admin')
  )
  WITH CHECK (company_id = public.get_my_company_id());

-- Inserts are performed only by the SECURITY DEFINER trigger; no direct-insert policy needed.


-- ── 6. Grants ─────────────────────────────────────────────────────────────────

GRANT SELECT, UPDATE ON public.business_configuration TO authenticated;
GRANT ALL             ON public.business_configuration TO service_role;
GRANT EXECUTE ON FUNCTION public.default_business_config(TEXT)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_default_business_configuration()  TO authenticated;


-- ── 7. Comments ───────────────────────────────────────────────────────────────

COMMENT ON TABLE  public.business_configuration IS
  'One configuration row per company. Seeded automatically on company creation via trigger.';
COMMENT ON COLUMN public.business_configuration.enabled_modules IS
  'Map of module slug → boolean. Controls which app sections are active for this company.';
COMMENT ON COLUMN public.business_configuration.dashboard_layout IS
  'Default dashboard view and widget list for this business type.';
COMMENT ON COLUMN public.business_configuration.feature_flags IS
  'Boolean feature toggles such as ai_proposals, whatsapp_campaigns, etc.';
COMMENT ON COLUMN public.business_configuration.branding IS
  'Colour and typography hints used for AI-generated documents.';
COMMENT ON COLUMN public.business_configuration.ai_configuration IS
  'Persona, tone, and industry context injected into AI prompts.';
