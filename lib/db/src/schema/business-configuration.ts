import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { companiesTable, BUSINESS_TYPES, type BusinessType } from "./companies";

// ─── JSONB field schemas ──────────────────────────────────────────────────────

/** All CRM modules that can be toggled per business type. */
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

/** Map of module slug → enabled boolean. */
export type EnabledModules = Record<ModuleSlug, boolean>;

/** A single widget entry in a dashboard layout. */
export interface DashboardWidget {
  id: string;
  type: string;
  position?: { x: number; y: number; w: number; h: number };
  config?: Record<string, unknown>;
}

/**
 * Dashboard layout configuration.
 * `widgets` may be either a list of widget-id strings (simple form produced by
 * the SQL seed) or fully-specified DashboardWidget objects (rich form set via
 * the update service).
 */
export interface DashboardLayout {
  default_view: string;
  widgets: (string | DashboardWidget)[];
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
  [key: string]: boolean; // allow extension without a migration
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

// ─── Zod schemas for each JSONB field ────────────────────────────────────────

export const enabledModulesSchema = z
  .record(z.enum(MODULE_SLUGS), z.boolean())
  .describe("Map of module slug to enabled boolean");

export const dashboardLayoutSchema = z.object({
  default_view: z.string(),
  widgets: z.array(
    z.union([
      z.string(),
      z.object({
        id:       z.string(),
        type:     z.string(),
        position: z
          .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
          .optional(),
        config: z.record(z.unknown()).optional(),
      }),
    ]),
  ),
});

export const featureFlagsSchema = z
  .object({
    ai_proposals:       z.boolean(),
    ai_lead_scoring:    z.boolean(),
    whatsapp_campaigns: z.boolean(),
    email_campaigns:    z.boolean(),
    client_portal:      z.boolean(),
    multi_currency:     z.boolean(),
    advanced_analytics: z.boolean(),
  })
  .catchall(z.boolean());

export const brandingConfigSchema = z.object({
  primary_color:   z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex colour"),
  secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex colour"),
  accent_color:    z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex colour"),
  logo_position:   z.enum(["left", "center", "right"]),
  font_family:     z.string(),
});

export const aiConfigurationSchema = z.object({
  persona:                z.string(),
  tone:                   z.enum(["professional", "friendly", "formal", "casual", "motivational"]),
  language_style:         z.string(),
  proposal_template_hint: z.string(),
  industry_context:       z.string(),
});

// ─── Drizzle table definition ─────────────────────────────────────────────────

/**
 * public.business_configuration
 *
 * One row per company. Created automatically by the on_company_created_init_config
 * trigger whenever a new company is inserted (migration 028).
 */
export const businessConfigurationTable = pgTable("business_configuration", {
  id:               uuid("id").primaryKey().defaultRandom(),
  company_id:       uuid("company_id")
                      .notNull()
                      .unique()
                      .references(() => companiesTable.id, { onDelete: "cascade" }),
  business_type:    text("business_type").notNull().default("agency"),
  enabled_modules:  jsonb("enabled_modules").notNull().default({}),
  dashboard_layout: jsonb("dashboard_layout").notNull().default({}),
  feature_flags:    jsonb("feature_flags").notNull().default({}),
  branding:         jsonb("branding").notNull().default({}),
  ai_configuration: jsonb("ai_configuration").notNull().default({}),
  created_at:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Drizzle-derived Zod schemas ──────────────────────────────────────────────

export const insertBusinessConfigurationSchema = createInsertSchema(
  businessConfigurationTable,
  {
    business_type:    z.enum(BUSINESS_TYPES).default("agency"),
    enabled_modules:  enabledModulesSchema,
    dashboard_layout: dashboardLayoutSchema,
    feature_flags:    featureFlagsSchema,
    branding:         brandingConfigSchema,
    ai_configuration: aiConfigurationSchema,
  },
).omit({ id: true, created_at: true, updated_at: true });

export const selectBusinessConfigurationSchema = createSelectSchema(
  businessConfigurationTable,
  {
    business_type:    z.enum(BUSINESS_TYPES),
    enabled_modules:  enabledModulesSchema,
    dashboard_layout: dashboardLayoutSchema,
    feature_flags:    featureFlagsSchema,
    branding:         brandingConfigSchema,
    ai_configuration: aiConfigurationSchema,
  },
);

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type InsertBusinessConfiguration = z.infer<typeof insertBusinessConfigurationSchema>;
export type BusinessConfiguration       = z.infer<typeof selectBusinessConfigurationSchema>;

/**
 * Partial update shape — only the five JSONB blobs and business_type are
 * updatable by callers. id, company_id, and timestamps are server-managed.
 */
export type BusinessConfigurationUpdate = Pick<
  InsertBusinessConfiguration,
  "business_type" | "enabled_modules" | "dashboard_layout" | "feature_flags" | "branding" | "ai_configuration"
>;

// Re-export BusinessType for convenience
export type { BusinessType };
