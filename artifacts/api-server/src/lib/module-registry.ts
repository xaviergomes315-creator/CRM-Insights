/**
 * Module Registry Service (backend)
 *
 * getAvailableModules(companyId, options?)
 *   Returns every module annotated with per-company is_enabled / is_supported.
 *
 * getVisibleModules(companyId, role?)
 *   Returns only modules that are production_ready, not hidden, and enabled
 *   for the given company — the default navigation surface.
 *
 * Both functions use the Supabase service-role client (bypasses RLS) and
 * are intentionally unused in routes for now.
 */

import {
  MODULE_REGISTRY,
  MODULE_REGISTRY_MAP,
  MODULE_CATEGORY_LABELS,
  isModuleSupported,
  isVisibleAndReady,
  getModulesByCategory,
  getModuleDefinition,
  hasPermission,
  type ModuleDefinition,
  type AvailableModule,
  type ModuleCategory,
  type UserRole,
} from "@workspace/db";

import {
  getBusinessConfiguration,
  BusinessConfigurationError,
} from "./business-configuration.js";

import type { BusinessType } from "@workspace/db";

// Re-export so consumers have one import path.
export type { ModuleDefinition, AvailableModule, ModuleCategory, UserRole };
export {
  MODULE_REGISTRY,
  MODULE_REGISTRY_MAP,
  MODULE_CATEGORY_LABELS,
  isModuleSupported,
  isVisibleAndReady,
  getModulesByCategory,
  getModuleDefinition,
  hasPermission,
  BusinessConfigurationError,
};

// ─── Option types ─────────────────────────────────────────────────────────────

export interface GetAvailableModulesOptions {
  /**
   * When set, only modules whose required_permissions includes this role
   * are returned.
   */
  role?: UserRole;

  /** Exclude modules where is_enabled = false. Default: false. */
  enabledOnly?: boolean;

  /** Exclude modules where is_supported = false. Default: false. */
  supportedOnly?: boolean;

  /** Exclude modules where production_ready = false. Default: false. */
  productionReadyOnly?: boolean;

  /** Exclude modules where hidden = true. Default: false. */
  visibleOnly?: boolean;
}

export interface AvailableModulesResult {
  /** Company's current business type (from business_configuration). */
  business_type: BusinessType;

  /** Filtered, sorted list of modules. */
  modules: AvailableModule[];

  /** Same list grouped by category; each group is sorted by sort_order. */
  by_category: Partial<Record<ModuleCategory, AvailableModule[]>>;
}

// ─── Shared config fetcher ────────────────────────────────────────────────────

async function fetchConfig(companyId: string): Promise<{
  businessType: BusinessType;
  enabledModulesMap: Record<string, boolean>;
}> {
  let businessType: BusinessType = "agency";
  let enabledModulesMap: Record<string, boolean> = {};

  try {
    const config = await getBusinessConfiguration(companyId);
    if (config) {
      businessType = (config.business_type as BusinessType) ?? "agency";
      enabledModulesMap =
        (config.enabled_modules as Record<string, boolean>) ?? {};
    }
  } catch (err) {
    console.warn(
      `[module-registry] Could not load business_configuration for company ` +
        `${companyId}; falling back to registry defaults.`,
      err,
    );
  }

  return { businessType, enabledModulesMap };
}

// ─── Annotator ────────────────────────────────────────────────────────────────

function annotate(
  businessType: BusinessType,
  enabledModulesMap: Record<string, boolean>,
): AvailableModule[] {
  return MODULE_REGISTRY.map((def): AvailableModule => {
    // Per-company enabled state: config value takes precedence, then registry default.
    const configValue = enabledModulesMap[def.module_key];
    const is_enabled =
      typeof configValue === "boolean" ? configValue : def.enabled;

    const is_supported = isModuleSupported(def, businessType);

    return { ...def, is_enabled, is_supported };
  });
}

// ─── Filter & group ───────────────────────────────────────────────────────────

function applyFilters(
  modules: AvailableModule[],
  options: GetAvailableModulesOptions,
): AvailableModule[] {
  const {
    role,
    enabledOnly = false,
    supportedOnly = false,
    productionReadyOnly = false,
    visibleOnly = false,
  } = options;

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
 * Returns every module in the registry annotated with per-company
 * is_enabled and is_supported flags.
 *
 * Fail-open: when no business_configuration row exists the function falls
 * back to each module's registry `enabled` flag so existing companies never
 * lose access to a feature on first deploy.
 *
 * @param companyId  UUID of the company.
 * @param options    Optional filters.
 *
 * @example
 * const { modules } = await getAvailableModules(companyId, {
 *   role: 'manager',
 *   enabledOnly: true,
 * });
 */
export async function getAvailableModules(
  companyId: string,
  options: GetAvailableModulesOptions = {},
): Promise<AvailableModulesResult> {
  const { businessType, enabledModulesMap } = await fetchConfig(companyId);

  const annotated = annotate(businessType, enabledModulesMap);
  const filtered  = applyFilters(annotated, options);
  const sorted    = filtered.sort((a, b) => a.sort_order - b.sort_order);

  return {
    business_type: businessType,
    modules:       sorted,
    by_category:   groupByCategory(sorted),
  };
}

// ─── getVisibleModules ────────────────────────────────────────────────────────

/**
 * Returns only the modules that should appear in the default navigation
 * surface — i.e. modules that are ALL of:
 *   • production_ready = true   (stable, not experimental)
 *   • hidden = false            (not explicitly suppressed)
 *   • is_enabled = true         (on for this company per business_configuration)
 *
 * Optionally filtered by `role` so employee-restricted modules are excluded
 * when rendering employee-facing navigation.
 *
 * Fail-open: if business_configuration cannot be loaded, every module that
 * passes the production_ready + hidden gate is included.
 *
 * @param companyId  UUID of the company.
 * @param role       Optional role for permission filtering.
 *
 * @example
 * const { modules, by_category } = await getVisibleModules(companyId, 'employee');
 * // Use modules to render the sidebar nav items.
 */
export async function getVisibleModules(
  companyId: string,
  role?: UserRole,
): Promise<AvailableModulesResult> {
  return getAvailableModules(companyId, {
    role,
    enabledOnly:         true,
    productionReadyOnly: true,
    visibleOnly:         true,
  });
}
