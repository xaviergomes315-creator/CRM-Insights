/**
 * Module Registry (frontend)
 *
 * Self-contained: does NOT import from @workspace/db (server-only).
 * All module data is defined inline so the frontend bundle has no extra dep.
 *
 * getAvailableModules(supabaseClient, companyId, options?)
 *   Annotates the registry with per-company is_enabled / is_supported flags.
 *
 * getVisibleModules(supabaseClient, companyId, role?)
 *   Returns only production-ready, visible, enabled modules — the default
 *   navigation surface.
 *
 * NOTE: Both functions are exported but not yet called from any component.
 */

import type { ModuleSlug } from "./business-configuration";
import type { UserRole }   from "./supabase";

// ─── Categories ───────────────────────────────────────────────────────────────

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

// ─── BusinessType ─────────────────────────────────────────────────────────────

export type BusinessType =
  | "agency" | "restaurant" | "gym" | "clinic" | "retail"
  | "real_estate" | "manufacturing" | "education" | "finance"
  | "hospitality" | "other";

// ─── ModuleDefinition ─────────────────────────────────────────────────────────

export interface ModuleDefinition {
  /** Stable key — matches EnabledModules / MODULE_SLUGS. */
  module_key: ModuleSlug;

  /** Human-readable name for the sidebar and admin UI. */
  display_name: string;

  /** Category that drives sidebar section headings. */
  category: ModuleCategory;

  /** lucide-react icon name (PascalCase). */
  icon: string;

  /** Short description of the module's purpose. */
  description: string;

  /** Minimum roles that may access this module. */
  required_permissions: UserRole[];

  /** Business types that natively support this module. */
  supported_business_types: BusinessType[] | "all";

  // ── Lifecycle flags ──────────────────────────────────────────────────────

  /**
   * installed — the module's route and page component exist in the codebase.
   * false = planned but not yet built; must also set hidden = true.
   */
  installed: boolean;

  /**
   * enabled — platform-level default.  Used as fallback when no
   * business_configuration row exists for the company.
   */
  enabled: boolean;

  /**
   * beta — the module is available but its UX or API may still change.
   * Should display a visual "Beta" badge in the UI.
   */
  beta: boolean;

  /**
   * production_ready — stable and safe to expose to all users.
   * getVisibleModules() filters to production_ready = true.
   */
  production_ready: boolean;

  /**
   * hidden — exclude from navigation and module lists regardless of other
   * flags.  Required when installed = false.
   */
  hidden: boolean;

  // ── Navigation ───────────────────────────────────────────────────────────

  /** Primary route path (must match App.tsx). */
  nav_href: string;

  /** Additional routes belonging to this module (sub-pages, detail views). */
  secondary_hrefs?: string[];

  /** Render order within the category group (lower = first). */
  sort_order: number;
}

/** ModuleDefinition enriched with live per-company flags. */
export interface AvailableModule extends ModuleDefinition {
  /**
   * is_enabled — true when business_configuration.enabled_modules[key] is
   * true, or when the registry `enabled` flag is true and no config row exists.
   */
  is_enabled: boolean;

  /**
   * is_supported — true when the company's business_type appears in
   * supported_business_types (or supported_business_types === 'all').
   */
  is_supported: boolean;
}

// ─── Service option types ─────────────────────────────────────────────────────

export interface GetAvailableModulesOptions {
  /** Filter by role permission. */
  role?: UserRole;
  /** Exclude modules where is_enabled = false. */
  enabledOnly?: boolean;
  /** Exclude modules where is_supported = false. */
  supportedOnly?: boolean;
  /** Exclude modules where production_ready = false. */
  productionReadyOnly?: boolean;
  /** Exclude modules where hidden = true. */
  visibleOnly?: boolean;
}

export interface AvailableModulesResult {
  business_type: BusinessType;
  modules: AvailableModule[];
  by_category: Partial<Record<ModuleCategory, AvailableModule[]>>;
}

// ─── MODULE_REGISTRY ──────────────────────────────────────────────────────────

export const MODULE_REGISTRY: ModuleDefinition[] = [

  // ── Core ────────────────────────────────────────────────────────────────
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

  // ── Communication ────────────────────────────────────────────────────────
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
    installed:                true,
    enabled:                  true,
    beta:                     true,
    production_ready:         false,  // excluded from getVisibleModules
    hidden:                   false,
    nav_href:                 "/social-media",
    sort_order:               60,
  },

  // ── Finance ──────────────────────────────────────────────────────────────
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

  // ── Operations ───────────────────────────────────────────────────────────
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
    installed:                false,  // no page yet
    enabled:                  false,
    beta:                     false,
    production_ready:         false,
    hidden:                   true,   // required when installed = false
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
    installed:                false,  // no page yet
    enabled:                  false,
    beta:                     false,
    production_ready:         false,
    hidden:                   true,   // required when installed = false
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

export const MODULE_REGISTRY_MAP: Readonly<Record<string, ModuleDefinition>> =
  Object.fromEntries(MODULE_REGISTRY.map((m) => [m.module_key, m]));

export function getModuleDefinition(key: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY_MAP[key];
}

export function getModulesByCategory(cat: ModuleCategory): ModuleDefinition[] {
  return MODULE_REGISTRY.filter((m) => m.category === cat)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function hasPermission(m: ModuleDefinition, role: UserRole): boolean {
  return m.required_permissions.includes(role);
}

export function isModuleSupported(
  m: ModuleDefinition,
  businessType: BusinessType,
): boolean {
  if (m.supported_business_types === "all") return true;
  return (m.supported_business_types as BusinessType[]).includes(businessType);
}

export function isVisibleAndReady(m: ModuleDefinition): boolean {
  return m.production_ready && !m.hidden;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function applyFilters(
  modules: AvailableModule[],
  opts: GetAvailableModulesOptions,
): AvailableModule[] {
  const {
    role,
    enabledOnly = false,
    supportedOnly = false,
    productionReadyOnly = false,
    visibleOnly = false,
  } = opts;

  return modules.filter((m) => {
    if (role !== undefined && !hasPermission(m, role))  return false;
    if (enabledOnly && !m.is_enabled)                    return false;
    if (supportedOnly && !m.is_supported)                return false;
    if (productionReadyOnly && !m.production_ready)      return false;
    if (visibleOnly && m.hidden)                         return false;
    return true;
  });
}

function groupByCategory(
  modules: AvailableModule[],
): Partial<Record<ModuleCategory, AvailableModule[]>> {
  const map: Partial<Record<ModuleCategory, AvailableModule[]>> = {};
  for (const m of modules) {
    if (!map[m.category]) map[m.category] = [];
    map[m.category]!.push(m);
  }
  for (const group of Object.values(map)) {
    group!.sort((a, b) => a.sort_order - b.sort_order);
  }
  return map;
}

// ─── getAvailableModules ──────────────────────────────────────────────────────

/**
 * Fetches business_configuration via the Supabase browser client and returns
 * the full module list annotated with per-company flags.
 *
 * Fail-open: when no configuration row exists every module falls back to its
 * registry `enabled` flag so the app stays fully functional.
 *
 * @param supabaseClient  The Supabase browser client from `@/lib/supabase`.
 * @param companyId       UUID of the company.
 * @param options         Optional filters.
 *
 * @example
 * import { supabase } from '@/lib/supabase';
 * const { modules } = await getAvailableModules(supabase, companyId, {
 *   role: profile.role,
 *   enabledOnly: true,
 * });
 */
export async function getAvailableModules(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any,
  companyId: string,
  options: GetAvailableModulesOptions = {},
): Promise<AvailableModulesResult> {
  let businessType: BusinessType = "agency";
  let enabledModulesMap: Record<string, boolean> = {};

  try {
    const { data, error } = await supabaseClient
      .from("business_configuration")
      .select("business_type, enabled_modules")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!error && data) {
      businessType    = (data.business_type    as BusinessType)          ?? "agency";
      enabledModulesMap = (data.enabled_modules as Record<string, boolean>) ?? {};
    }
  } catch {
    console.warn("[module-registry] Could not fetch business_configuration; using defaults.");
  }

  const annotated: AvailableModule[] = MODULE_REGISTRY.map((def): AvailableModule => {
    const configValue = enabledModulesMap[def.module_key];
    const is_enabled  =
      typeof configValue === "boolean" ? configValue : def.enabled;
    const is_supported = isModuleSupported(def, businessType);
    return { ...def, is_enabled, is_supported };
  });

  const filtered = applyFilters(annotated, options)
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    business_type: businessType,
    modules:       filtered,
    by_category:   groupByCategory(filtered),
  };
}

// ─── getVisibleModules ────────────────────────────────────────────────────────

/**
 * Returns only the modules that should appear in the default navigation
 * surface:
 *   • production_ready = true   (stable, not experimental)
 *   • hidden = false            (not suppressed)
 *   • is_enabled = true         (on for this company)
 *
 * Optionally filtered by `role` to exclude modules the user cannot access.
 *
 * Fail-open: if business_configuration cannot be loaded every module that
 * passes the production_ready + hidden gate is returned.
 *
 * @example
 * import { supabase } from '@/lib/supabase';
 * const { modules, by_category } = await getVisibleModules(
 *   supabase,
 *   profile.company_id!,
 *   profile.role,
 * );
 */
export async function getVisibleModules(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any,
  companyId: string,
  role?: UserRole,
): Promise<AvailableModulesResult> {
  return getAvailableModules(supabaseClient, companyId, {
    role,
    enabledOnly:         true,
    productionReadyOnly: true,
    visibleOnly:         true,
  });
}
