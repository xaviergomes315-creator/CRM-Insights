/**
 * Business Configuration — frontend types and helpers
 *
 * Mirrors the DB-layer types from lib/db without creating a circular
 * dependency on the backend service.  These types are consumed by any
 * future React component or hook that reads / updates business_configuration
 * via Supabase's client-side API.
 *
 * NOTE: This module intentionally exports types and helpers only.
 *       No React state, no hooks, no Supabase calls — those belong in a
 *       dedicated hook file when this service is first used.
 */

// ─── Module slugs ─────────────────────────────────────────────────────────────

export const MODULE_SLUGS = [
  "leads",
  "pipeline",
  "proposals",
  "invoices",
  "whatsapp",
  "calls",
  "hr",
  "tasks",
  "documents",
  "client_portal",
  "support_tickets",
  "website_projects",
  "analytics",
  "social_media",
] as const;

export type ModuleSlug = (typeof MODULE_SLUGS)[number];

/** Human-readable labels for each module slug. */
export const MODULE_LABELS: Record<ModuleSlug, string> = {
  leads:            "Leads",
  pipeline:         "Pipeline",
  proposals:        "Proposals",
  invoices:         "Invoices",
  whatsapp:         "WhatsApp",
  calls:            "Calls",
  hr:               "HR",
  tasks:            "Tasks",
  documents:        "Documents",
  client_portal:    "Client Portal",
  support_tickets:  "Support Tickets",
  website_projects: "Website Projects",
  analytics:        "Analytics",
  social_media:     "Social Media",
};

// ─── JSONB field types ────────────────────────────────────────────────────────

/** Map of module slug → enabled boolean. */
export type EnabledModules = Partial<Record<ModuleSlug, boolean>>;

/** A single widget entry in a dashboard layout. */
export interface DashboardWidget {
  id:       string;
  type:     string;
  position?: { x: number; y: number; w: number; h: number };
  config?:  Record<string, unknown>;
}

/**
 * Dashboard layout configuration.
 * `widgets` is either a string-id list (SQL seed form) or rich objects
 * (set via update service).
 */
export interface DashboardLayout {
  default_view: string;
  widgets:      (string | DashboardWidget)[];
}

/** Boolean feature toggles. */
export interface FeatureFlags {
  ai_proposals:       boolean;
  ai_lead_scoring:    boolean;
  whatsapp_campaigns: boolean;
  email_campaigns:    boolean;
  client_portal:      boolean;
  multi_currency:     boolean;
  advanced_analytics: boolean;
  [key: string]: boolean;
}

/** Branding hints used for AI-generated documents and UI theming. */
export interface BrandingConfig {
  primary_color:   string;
  secondary_color: string;
  accent_color:    string;
  logo_position:   "left" | "center" | "right";
  font_family:     string;
}

/** AI persona and prompt context injected into LLM calls. */
export interface AiConfiguration {
  persona:                string;
  tone:                   "professional" | "friendly" | "formal" | "casual" | "motivational";
  language_style:         string;
  proposal_template_hint: string;
  industry_context:       string;
}

// ─── Row type (mirrors public.business_configuration) ────────────────────────

/** Typed representation of a business_configuration Postgres row. */
export interface BusinessConfigurationRow {
  id:               string;
  company_id:       string;
  business_type:    string;
  enabled_modules:  EnabledModules;
  dashboard_layout: DashboardLayout;
  feature_flags:    FeatureFlags;
  branding:         BrandingConfig;
  ai_configuration: AiConfiguration;
  created_at:       string;
  updated_at:       string;
}

/** Fields that can be updated via the Supabase client. */
export type BusinessConfigurationUpdate = Partial<
  Pick<
    BusinessConfigurationRow,
    | "business_type"
    | "enabled_modules"
    | "dashboard_layout"
    | "feature_flags"
    | "branding"
    | "ai_configuration"
  >
>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the given module is enabled in a BusinessConfigurationRow.
 * Defaults to `true` when the configuration is unavailable (fail-open: do not
 * hide features from users just because the config could not be loaded).
 *
 * @example
 * const show = isModuleEnabled(config, 'pipeline');
 */
export function isModuleEnabled(
  config: BusinessConfigurationRow | null | undefined,
  module: ModuleSlug,
): boolean {
  if (!config) return true; // fail-open: show all modules when config missing
  const val = config.enabled_modules[module];
  return val === undefined ? true : val;
}

/**
 * Returns true when the given feature flag is enabled.
 * Defaults to `false` when the configuration is unavailable (fail-closed for
 * features — do not enable opt-in capabilities without an explicit signal).
 *
 * @example
 * const hasAI = isFeatureEnabled(config, 'ai_proposals');
 */
export function isFeatureEnabled(
  config: BusinessConfigurationRow | null | undefined,
  flag: keyof FeatureFlags,
): boolean {
  if (!config) return false; // fail-closed: do not enable opt-in features
  return config.feature_flags[flag] ?? false;
}

/**
 * Shallow-merges `patch` into `base` for safe partial JSONB updates.
 *
 * @example
 * const newFlags = mergeConfig(row.feature_flags, { ai_proposals: true });
 */
export function mergeConfig<T extends Record<string, unknown>>(
  base: T,
  patch: Partial<T>,
): T {
  return { ...base, ...patch };
}
