/**
 * Central Module Registry
 *
 * Single source of truth for every CRM module: its key, display name,
 * category, icon, required role permissions, supported business types,
 * and the five lifecycle flags (installed / enabled / beta /
 * production_ready / hidden).
 *
 * No runtime dependencies on Supabase, React, or any external package —
 * safe to import from both the backend (api-server) and any future tooling.
 *
 * Icon names are lucide-react PascalCase strings. The frontend maps them
 * to actual React components; the backend treats them as opaque strings.
 */

import type { BusinessType } from "./companies";

// ─── Role type ────────────────────────────────────────────────────────────────

export type UserRole =
  | "super_admin"
  | "company_admin"
  | "manager"
  | "employee";

// ─── Module categories ────────────────────────────────────────────────────────

export const MODULE_CATEGORIES = [
  "core",
  "communication",
  "finance",
  "operations",
  "client_success",
  "analytics",
] as const;

export type ModuleCategory = (typeof MODULE_CATEGORIES)[number];

export const MODULE_CATEGORY_LABELS: Record<ModuleCategory, string> = {
  core:           "Core",
  communication:  "Communication",
  finance:        "Finance",
  operations:     "Operations",
  client_success: "Client Success",
  analytics:      "Analytics & Admin",
};

// ─── Module definition ────────────────────────────────────────────────────────

export interface ModuleDefinition {
  /** Stable identifier — matches the key in EnabledModules / MODULE_SLUGS. */
  module_key: string;

  /** Human-readable name shown in the sidebar and admin UI. */
  display_name: string;

  /** Grouping category (drives sidebar section headings). */
  category: ModuleCategory;

  /**
   * lucide-react icon name in PascalCase.
   * Frontend resolves this to a React component; backend uses it as a string.
   */
  icon: string;

  /** One-sentence description of the module's purpose. */
  description: string;

  /** Minimum roles that may access this module. */
  required_permissions: UserRole[];

  /**
   * Business types that natively support this module.
   * 'all' → every type including future ones.
   * BusinessType[] → explicit allowlist.
   */
  supported_business_types: BusinessType[] | "all";

  // ── Lifecycle flags ────────────────────────────────────────────────────────

  /**
   * installed
   * The module's route and page component exist in the codebase.
   * false = the module is planned but not yet built; its nav_href has no
   * matching Route in App.tsx. Such modules must also be hidden = true.
   */
  installed: boolean;

  /**
   * enabled
   * Platform-level default enabled state.  Used as the fallback value for
   * getAvailableModules() when no business_configuration row exists.
   * The per-company override lives in business_configuration.enabled_modules.
   */
  enabled: boolean;

  /**
   * beta
   * The module is available but still under active development. Its UX,
   * APIs, or data model may change without notice. Beta modules may be
   * shown to users but should carry a visual "Beta" badge.
   */
  beta: boolean;

  /**
   * production_ready
   * The module is stable, tested, and safe to expose to all users without
   * caveats. getVisibleModules() filters to production_ready = true, so
   * setting this to false removes the module from the default navigation
   * surface even when it is installed and enabled.
   */
  production_ready: boolean;

  /**
   * hidden
   * Exclude the module from navigation and any auto-generated module lists
   * regardless of other flags. Use for modules that are not yet installed,
   * deprecated, or only accessible via direct URL.
   */
  hidden: boolean;

  // ── Navigation ────────────────────────────────────────────────────────────

  /** Primary route path for this module (must match App.tsx). */
  nav_href: string;

  /** Additional routes that belong to this module (sub-pages, detail views). */
  secondary_hrefs?: string[];

  /**
   * Rendering order within its category group.
   * Lower numbers appear first.
   */
  sort_order: number;
}

/**
 * ModuleDefinition enriched with live per-company flags from
 * getAvailableModules() / getVisibleModules().
 */
export interface AvailableModule extends ModuleDefinition {
  /**
   * is_enabled
   * true  → business_configuration.enabled_modules[module_key] is true,
   *         or the registry's `enabled` flag when no config row exists.
   * false → explicitly disabled for this company.
   */
  is_enabled: boolean;

  /**
   * is_supported
   * true  → the company's business_type appears in supported_business_types
   *         (or supported_business_types === 'all').
   * false → the module exists but is not a natural fit for this business type.
   */
  is_supported: boolean;
}

// ─── The Registry ─────────────────────────────────────────────────────────────

/**
 * MODULE_REGISTRY
 *
 * Add a new entry here when a new module/page is introduced.
 * Do NOT remove entries — set installed = false and hidden = true instead.
 *
 * Lifecycle flag rules:
 *   • installed = false  →  hidden must also be true
 *   • beta = true        →  production_ready may be true or false
 *   • production_ready = false  →  excluded from getVisibleModules()
 */
export const MODULE_REGISTRY: ModuleDefinition[] = [

  // ── Core ──────────────────────────────────────────────────────────────────

  {
    module_key:               "leads",
    display_name:             "Leads",
    category:                 "core",
    icon:                     "Users",
    description:              "Manage and track all inbound and outbound leads.",
    required_permissions:     ["super_admin", "company_admin", "manager", "employee"],
    supported_business_types: "all",
    installed:                true,
    enabled:                  true,
    beta:                     false,
    production_ready:         true,
    hidden:                   false,
    nav_href:                 "/leads",
    sort_order:               10,
  },

  {
    module_key:               "pipeline",
    display_name:             "Pipeline",
    category:                 "core",
    icon:                     "Kanban",
    description:              "Visualise and manage deals through a Kanban pipeline.",
    required_permissions:     ["super_admin", "company_admin", "manager", "employee"],
    supported_business_types: [
      "agency", "gym", "clinic", "real_estate", "manufacturing", "education", "finance",
    ],
    installed:                true,
    enabled:                  true,
    beta:                     false,
    production_ready:         true,
    hidden:                   false,
    nav_href:                 "/pipeline",
    sort_order:               20,
  },

  {
    module_key:               "tasks",
    display_name:             "Tasks",
    category:                 "core",
    icon:                     "CheckSquare",
    description:              "Create and track follow-up tasks tied to leads.",
    required_permissions:     ["super_admin", "company_admin", "manager", "employee"],
    supported_business_types: "all",
    installed:                true,
    enabled:                  true,
    beta:                     false,
    production_ready:         true,
    hidden:                   false,
    nav_href:                 "/tasks",
    sort_order:               30,
  },

  // ── Communication ─────────────────────────────────────────────────────────

  {
    module_key:               "calls",
    display_name:             "Calls",
    category:                 "communication",
    icon:                     "PhoneCall",
    description:              "Log and manage outbound calls and telecaller activity.",
    required_permissions:     ["super_admin", "company_admin", "manager", "employee"],
    supported_business_types: "all",
    installed:                true,
    enabled:                  true,
    beta:                     false,
    production_ready:         true,
    hidden:                   false,
    nav_href:                 "/telecaller",
    secondary_hrefs:          ["/call-log"],
    sort_order:               40,
  },

  {
    module_key:               "whatsapp",
    display_name:             "WhatsApp",
    category:                 "communication",
    icon:                     "MessageCircle",
    description:              "Send WhatsApp messages, manage templates, and run campaigns.",
    required_permissions:     ["super_admin", "company_admin", "manager", "employee"],
    supported_business_types: [
      "agency", "restaurant", "gym", "clinic", "retail", "real_estate",
      "hospitality", "education", "finance", "other",
    ],
    installed:                true,
    enabled:                  true,
    beta:                     false,
    production_ready:         true,
    hidden:                   false,
    nav_href:                 "/whatsapp",
    secondary_hrefs:          ["/whatsapp/campaigns"],
    sort_order:               50,
  },

  {
    module_key:               "social_media",
    display_name:             "Social Media",
    category:                 "communication",
    icon:                     "Share2",
    description:              "Schedule and manage social media content.",
    required_permissions:     ["super_admin", "company_admin", "manager", "employee"],
    supported_business_types: [
      "agency", "restaurant", "gym", "retail", "real_estate", "hospitality",
    ],
    // Page exists but feature set is early-stage; excluded from getVisibleModules.
    installed:                true,
    enabled:                  true,
    beta:                     true,
    production_ready:         false,
    hidden:                   false,
    nav_href:                 "/social-media",
    sort_order:               60,
  },

  // ── Finance ───────────────────────────────────────────────────────────────

  {
    module_key:               "proposals",
    display_name:             "Proposals",
    category:                 "finance",
    icon:                     "FileText",
    description:              "Create, send, and track professional proposals.",
    required_permissions:     ["super_admin", "company_admin", "manager", "employee"],
    supported_business_types: [
      "agency", "manufacturing", "real_estate", "education", "finance",
    ],
    installed:                true,
    enabled:                  true,
    beta:                     false,
    production_ready:         true,
    hidden:                   false,
    nav_href:                 "/proposals",
    sort_order:               70,
  },

  {
    module_key:               "invoices",
    display_name:             "Invoices",
    category:                 "finance",
    icon:                     "Receipt",
    description:              "Generate and manage client invoices.",
    required_permissions:     ["super_admin", "company_admin", "manager"],
    supported_business_types: "all",
    installed:                true,
    enabled:                  true,
    beta:                     false,
    production_ready:         true,
    hidden:                   false,
    nav_href:                 "/invoices",
    sort_order:               80,
  },

  // ── Operations ────────────────────────────────────────────────────────────

  {
    module_key:               "hr",
    display_name:             "HR",
    category:                 "operations",
    icon:                     "Briefcase",
    description:              "Manage employees, attendance, and HR records.",
    required_permissions:     ["super_admin", "company_admin", "manager", "employee"],
    supported_business_types: [
      "agency", "restaurant", "gym", "clinic", "manufacturing",
      "education", "hospitality", "finance", "retail",
    ],
    installed:                true,
    enabled:                  true,
    beta:                     false,
    production_ready:         true,
    hidden:                   false,
    nav_href:                 "/hr",
    sort_order:               90,
  },

  {
    module_key:               "website_projects",
    display_name:             "Website Projects",
    category:                 "operations",
    icon:                     "Globe",
    description:              "Track website and digital project delivery.",
    required_permissions:     ["super_admin", "company_admin", "manager", "employee"],
    supported_business_types: ["agency", "education"],
    installed:                true,
    enabled:                  true,
    beta:                     false,
    production_ready:         true,
    hidden:                   false,
    nav_href:                 "/website-projects",
    secondary_hrefs:          ["/website-projects/:id"],
    sort_order:               100,
  },

  {
    module_key:               "documents",
    display_name:             "Documents",
    category:                 "operations",
    icon:                     "FolderOpen",
    description:              "Store and manage client and company documents.",
    required_permissions:     ["super_admin", "company_admin", "manager", "employee"],
    supported_business_types: [
      "agency", "clinic", "manufacturing", "real_estate", "education", "finance",
    ],
    // No page built yet — must stay hidden until installed.
    installed:                false,
    enabled:                  false,
    beta:                     false,
    production_ready:         false,
    hidden:                   true,
    nav_href:                 "/documents",
    sort_order:               110,
  },

  // ── Client Success ────────────────────────────────────────────────────────

  {
    module_key:               "client_portal",
    display_name:             "Client Portal",
    category:                 "client_success",
    icon:                     "Building2",
    description:              "Self-service portal where clients can view their projects.",
    required_permissions:     ["super_admin", "company_admin", "manager", "employee"],
    supported_business_types: [
      "agency", "gym", "clinic", "real_estate", "education", "finance",
    ],
    installed:                true,
    enabled:                  true,
    beta:                     false,
    production_ready:         true,
    hidden:                   false,
    nav_href:                 "/client-portal",
    sort_order:               120,
  },

  {
    module_key:               "support_tickets",
    display_name:             "Support Tickets",
    category:                 "client_success",
    icon:                     "LifeBuoy",
    description:              "Manage inbound support requests from clients.",
    required_permissions:     ["super_admin", "company_admin", "manager", "employee"],
    supported_business_types: [
      "agency", "restaurant", "gym", "clinic", "manufacturing", "retail",
      "education", "hospitality", "finance", "other",
    ],
    // No page built yet — must stay hidden until installed.
    installed:                false,
    enabled:                  false,
    beta:                     false,
    production_ready:         false,
    hidden:                   true,
    nav_href:                 "/support-tickets",
    sort_order:               130,
  },

  // ── Analytics & Admin ────────────────────────────────────────────────────

  {
    module_key:               "analytics",
    display_name:             "Analytics",
    category:                 "analytics",
    icon:                     "PieChart",
    description:              "View revenue, pipeline, and performance dashboards.",
    required_permissions:     ["super_admin", "company_admin", "manager"],
    supported_business_types: "all",
    installed:                true,
    enabled:                  true,
    beta:                     false,
    production_ready:         true,
    hidden:                   false,
    nav_href:                 "/analytics",
    sort_order:               140,
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** O(1) lookup by module_key. */
export const MODULE_REGISTRY_MAP: Readonly<Record<string, ModuleDefinition>> =
  Object.fromEntries(MODULE_REGISTRY.map((m) => [m.module_key, m]));

/** Returns the ModuleDefinition for a given key, or undefined if not found. */
export function getModuleDefinition(key: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY_MAP[key];
}

/** Returns all modules in the given category, sorted by sort_order. */
export function getModulesByCategory(cat: ModuleCategory): ModuleDefinition[] {
  return MODULE_REGISTRY.filter((m) => m.category === cat)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Returns true when `role` satisfies the module's required_permissions. */
export function hasPermission(m: ModuleDefinition, role: UserRole): boolean {
  return m.required_permissions.includes(role);
}

/** Returns true when `businessType` is in the module's supported_business_types. */
export function isModuleSupported(
  m: ModuleDefinition,
  businessType: BusinessType,
): boolean {
  if (m.supported_business_types === "all") return true;
  return (m.supported_business_types as BusinessType[]).includes(businessType);
}

/**
 * Returns true when the module passes the visibility gate:
 *   production_ready = true AND hidden = false
 *
 * Used internally by getVisibleModules(); exposed here so callers can apply
 * the same predicate to a pre-fetched list without a second async call.
 */
export function isVisibleAndReady(m: ModuleDefinition): boolean {
  return m.production_ready && !m.hidden;
}
