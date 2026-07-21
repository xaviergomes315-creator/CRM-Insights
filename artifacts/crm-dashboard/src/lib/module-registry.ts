/**
 * Module Registry (frontend)
 *
 * Self-contained copy of the module definitions and getAvailableModules()
 * for use inside React components.  It intentionally does NOT import from
 * @workspace/db (which is a server-only package) — instead the data is
 * defined inline so the frontend bundle has no extra dependency.
 *
 * getAvailableModules() here queries business_configuration directly via
 * the Supabase browser client (anon key + RLS) rather than the service-role
 * client used by the backend service.
 *
 * NOTE: The service is exported but not yet called from any component.
 *       It is the foundation for future client-side module gating.
 */

import type {
  ModuleSlug,
  BusinessConfigurationRow,
} from "./business-configuration";

import type { UserRole } from "./supabase";

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

// ─── Types ────────────────────────────────────────────────────────────────────

export type BusinessType =
  | "agency" | "restaurant" | "gym" | "clinic" | "retail"
  | "real_estate" | "manufacturing" | "education" | "finance"
  | "hospitality" | "other";

export interface ModuleDefinition {
  module_key: ModuleSlug;
  display_name: string;
  category: ModuleCategory;
  /** lucide-react icon name (PascalCase). */
  icon: string;
  description: string;
  required_permissions: UserRole[];
  supported_business_types: BusinessType[] | "all";
  default_enabled: boolean;
  nav_href: string;
  secondary_hrefs?: string[];
  sort_order: number;
}

export interface AvailableModule extends ModuleDefinition {
  is_enabled: boolean;
  is_supported: boolean;
}

export interface GetAvailableModulesOptions {
  role?: UserRole;
  enabledOnly?: boolean;
  supportedOnly?: boolean;
}

export interface AvailableModulesResult {
  business_type: BusinessType;
  modules: AvailableModule[];
  by_category: Partial<Record<ModuleCategory, AvailableModule[]>>;
}

// ─── Module Registry ──────────────────────────────────────────────────────────

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

  // ── Communication ────────────────────────────────────────────────────────
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

export const MODULE_REGISTRY_MAP: Readonly<Record<string, ModuleDefinition>> =
  Object.fromEntries(MODULE_REGISTRY.map((m) => [m.module_key, m]));

export function getModuleDefinition(key: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY_MAP[key];
}

export function getModulesByCategory(cat: ModuleCategory): ModuleDefinition[] {
  return MODULE_REGISTRY.filter((m) => m.category === cat).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
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

// ─── getAvailableModules (frontend) ──────────────────────────────────────────

/**
 * Fetches the company's business_configuration via the Supabase browser
 * client and returns the annotated module list.
 *
 * Fail-open: when no configuration row exists (or the fetch fails) the
 * function returns all modules with is_enabled = default_enabled so the
 * app stays fully functional.
 *
 * @param supabaseClient  The Supabase browser client from `@/lib/supabase`.
 * @param companyId       UUID of the company.
 * @param options         Optional filters.
 *
 * @example
 * import { supabase } from '@/lib/supabase';
 * const result = await getAvailableModules(supabase, profile.company_id!, {
 *   role: profile.role,
 *   enabledOnly: true,
 * });
 */
export async function getAvailableModules(
  // Typed as `any` to avoid importing the full SupabaseClient type here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any,
  companyId: string,
  options: GetAvailableModulesOptions = {},
): Promise<AvailableModulesResult> {
  const { role, enabledOnly = false, supportedOnly = false } = options;

  // ── 1. Fetch configuration (fail-open) ────────────────────────────────────
  let businessType: BusinessType = "agency";
  let enabledModulesMap: Record<string, boolean> = {};

  try {
    const { data, error } = await supabaseClient
      .from("business_configuration")
      .select("business_type, enabled_modules")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!error && data) {
      businessType = (data.business_type as BusinessType) ?? "agency";
      enabledModulesMap =
        (data.enabled_modules as Record<string, boolean>) ?? {};
    }
  } catch {
    // Fail-open: use defaults if fetch throws.
    console.warn(
      "[module-registry] Could not fetch business_configuration; using module defaults.",
    );
  }

  // ── 2. Annotate modules ────────────────────────────────────────────────────
  const annotated: AvailableModule[] = MODULE_REGISTRY.map(
    (def): AvailableModule => {
      const configValue = enabledModulesMap[def.module_key];
      const is_enabled =
        typeof configValue === "boolean" ? configValue : def.default_enabled;
      const is_supported = isModuleSupported(def, businessType);
      return { ...def, is_enabled, is_supported };
    },
  );

  // ── 3. Apply filters ───────────────────────────────────────────────────────
  let filtered = annotated;
  if (role !== undefined)  filtered = filtered.filter((m) => hasPermission(m, role));
  if (enabledOnly)         filtered = filtered.filter((m) => m.is_enabled);
  if (supportedOnly)       filtered = filtered.filter((m) => m.is_supported);

  // ── 4. Group by category ──────────────────────────────────────────────────
  const by_category = filtered.reduce<Partial<Record<ModuleCategory, AvailableModule[]>>>(
    (acc, mod) => {
      if (!acc[mod.category]) acc[mod.category] = [];
      acc[mod.category]!.push(mod);
      return acc;
    },
    {},
  );
  for (const group of Object.values(by_category)) {
    group?.sort((a, b) => a.sort_order - b.sort_order);
  }

  return {
    business_type: businessType,
    modules: filtered.sort((a, b) => a.sort_order - b.sort_order),
    by_category,
  };
}
