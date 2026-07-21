/**
 * Central Module Registry
 *
 * Single source of truth for every CRM module: its key, display name,
 * category, icon, required role permissions, and which business types
 * support it.
 *
 * This file has NO runtime dependencies on Supabase, React, or any external
 * package, so it can be imported by both the backend (api-server) and
 * any future shared tooling without pulling in browser or Node-specific code.
 *
 * Icon names are lucide-react PascalCase strings.  The frontend maps them to
 * actual React components; the backend can use them as string identifiers.
 */

import type { BusinessType } from "./companies";

// ─── Role type (duplicated here to avoid pulling in Supabase) ─────────────────

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

/** Human-readable labels for sidebar section headings. */
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
  /** Stable identifier that matches the key used in EnabledModules / MODULE_SLUGS. */
  module_key: string;

  /** Human-readable name shown in the sidebar and UI. */
  display_name: string;

  /** Grouping category (maps to a sidebar section heading). */
  category: ModuleCategory;

  /**
   * lucide-react icon name in PascalCase.
   * The frontend resolves this to an actual React component; the backend
   * treats it as an opaque string.
   */
  icon: string;

  /** One-sentence description of the module's purpose. */
  description: string;

  /**
   * The minimum set of roles that may access this module.
   * If a user's role is NOT in this list the module is inaccessible
   * regardless of the enabled_modules flag.
   */
  required_permissions: UserRole[];

  /**
   * Which business types natively support this module.
   * - 'all'          → every business type, including future ones.
   * - BusinessType[] → explicit allowlist; modules not listed are flagged
   *                    is_supported = false but still returned by
   *                    getAvailableModules so the caller can decide how
   *                    to present them.
   */
  supported_business_types: BusinessType[] | "all";

  /**
   * Fallback enabled state when no business_configuration row exists
   * (fail-open so existing companies never lose access on first deploy).
   */
  default_enabled: boolean;

  /** Primary route path for this module (matches App.tsx). */
  nav_href: string;

  /** Secondary routes that belong to this module (e.g. sub-pages). */
  secondary_hrefs?: string[];

  /**
   * Rendering order inside its category group.
   * Lower numbers appear first.
   */
  sort_order: number;
}

/**
 * A ModuleDefinition enriched with live per-company flags returned by
 * getAvailableModules().
 */
export interface AvailableModule extends ModuleDefinition {
  /**
   * true  → business_configuration.enabled_modules[module_key] is true
   *         (or default_enabled when no config row exists).
   * false → explicitly disabled for this company.
   */
  is_enabled: boolean;

  /**
   * true  → the company's business_type is in supported_business_types
   *         (or supported_business_types === 'all').
   * false → the module exists but is not a natural fit for this business type.
   */
  is_supported: boolean;
}

// ─── The Registry ─────────────────────────────────────────────────────────────

/**
 * MODULE_REGISTRY
 *
 * Ordered list of every module in the application.
 * Add a new entry here when a new module/page is introduced.
 * Do NOT remove entries — mark unsupported types instead.
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
    default_enabled:          true,
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
    default_enabled:          true,
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
    default_enabled:          true,
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
    default_enabled:          true,
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
    default_enabled:          true,
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
    default_enabled:          true,
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
    default_enabled:          true,
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
    default_enabled:          true,
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
    default_enabled:          true,
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
    default_enabled:          true,
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
    default_enabled:          false,
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
    default_enabled:          true,
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
    default_enabled:          false,
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
    default_enabled:          true,
    nav_href:                 "/analytics",
    sort_order:               140,
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** O(1) lookup by module_key. */
export const MODULE_REGISTRY_MAP: Readonly<Record<string, ModuleDefinition>> =
  Object.fromEntries(MODULE_REGISTRY.map((m) => [m.module_key, m]));

/**
 * Returns the ModuleDefinition for a given key, or undefined if not found.
 * Prefer this over directly indexing MODULE_REGISTRY_MAP for typed access.
 */
export function getModuleDefinition(
  moduleKey: string,
): ModuleDefinition | undefined {
  return MODULE_REGISTRY_MAP[moduleKey];
}

/**
 * Returns all modules that belong to the given category, sorted by sort_order.
 */
export function getModulesByCategory(category: ModuleCategory): ModuleDefinition[] {
  return MODULE_REGISTRY.filter((m) => m.category === category).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
}

/**
 * Returns true when `role` satisfies the module's required_permissions list.
 */
export function hasPermission(
  module: ModuleDefinition,
  role: UserRole,
): boolean {
  return module.required_permissions.includes(role);
}

/**
 * Returns true when `businessType` is in the module's supported_business_types.
 */
export function isModuleSupported(
  module: ModuleDefinition,
  businessType: BusinessType,
): boolean {
  if (module.supported_business_types === "all") return true;
  return (module.supported_business_types as BusinessType[]).includes(businessType);
}
