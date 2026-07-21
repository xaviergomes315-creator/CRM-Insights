/**
 * Module Registry Service (backend)
 *
 * Exposes getAvailableModules(companyId) which combines:
 *   1. MODULE_REGISTRY      — central definition of every CRM module
 *   2. business_configuration — per-company enabled_modules + business_type
 *
 * Returns a typed AvailableModule[] with is_enabled and is_supported flags
 * set for the given company.
 *
 * NOTE: This service is intentionally unused in routes for now.
 *       It is the foundation for future server-side module gating.
 */

import {
  MODULE_REGISTRY,
  isModuleSupported,
  getModulesByCategory,
  getModuleDefinition,
  hasPermission,
  MODULE_CATEGORY_LABELS,
  MODULE_REGISTRY_MAP,
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

// Re-export everything consumers might need from a single import path.
export type { ModuleDefinition, AvailableModule, ModuleCategory, UserRole };
export {
  MODULE_REGISTRY,
  MODULE_REGISTRY_MAP,
  MODULE_CATEGORY_LABELS,
  isModuleSupported,
  getModulesByCategory,
  getModuleDefinition,
  hasPermission,
};
export { BusinessConfigurationError };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GetAvailableModulesOptions {
  /**
   * When provided, only modules whose required_permissions includes this role
   * are returned.  Omit to return all modules regardless of role.
   */
  role?: UserRole;

  /**
   * When true, modules where is_enabled = false are excluded from the result.
   * Default: false (return all modules with the flag set).
   */
  enabledOnly?: boolean;

  /**
   * When true, modules where is_supported = false are excluded from the result.
   * Default: false (return all modules with the flag set).
   */
  supportedOnly?: boolean;
}

export interface AvailableModulesResult {
  /** Company's current business type. */
  business_type: BusinessType;

  /** Full list of modules (filtered by options). */
  modules: AvailableModule[];

  /**
   * Modules grouped by category, in the order defined by MODULE_CATEGORIES.
   * Each group only contains modules that passed the filter options.
   */
  by_category: Record<ModuleCategory, AvailableModule[]>;
}

// ─── getAvailableModules ──────────────────────────────────────────────────────

/**
 * Returns the full set of modules available to a company, annotated with
 * per-company is_enabled and is_supported flags.
 *
 * The function is intentionally non-throwing for missing configuration rows:
 * when no business_configuration exists it falls back to the module's
 * default_enabled value and treats every module as supported, so existing
 * companies never have features silently removed.
 *
 * @param companyId  UUID of the company.
 * @param options    Optional filters (role, enabledOnly, supportedOnly).
 * @returns          AvailableModulesResult containing the module list and a
 *                   by_category map.
 *
 * @example
 * const { modules, by_category, business_type } = await getAvailableModules(
 *   company.id,
 *   { role: 'employee', enabledOnly: true },
 * );
 */
export async function getAvailableModules(
  companyId: string,
  options: GetAvailableModulesOptions = {},
): Promise<AvailableModulesResult> {
  const { role, enabledOnly = false, supportedOnly = false } = options;

  // ── 1. Fetch business configuration (fail-open) ───────────────────────────
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
    // Log the error but do not fail — return defaults so the app stays usable.
    console.warn(
      `[module-registry] Failed to load business_configuration for company ${companyId}; ` +
        "falling back to module defaults.",
      err,
    );
  }

  // ── 2. Annotate every module in the registry ──────────────────────────────
  const annotated: AvailableModule[] = MODULE_REGISTRY.map(
    (def): AvailableModule => {
      // Enabled: use the config value when present, fall back to default.
      const configValue = enabledModulesMap[def.module_key];
      const is_enabled =
        typeof configValue === "boolean" ? configValue : def.default_enabled;

      // Supported: check whether the company's business_type is listed.
      const is_supported = isModuleSupported(def, businessType);

      return { ...def, is_enabled, is_supported };
    },
  );

  // ── 3. Apply filters ──────────────────────────────────────────────────────
  let filtered = annotated;

  if (role !== undefined) {
    filtered = filtered.filter((m) => hasPermission(m, role));
  }
  if (enabledOnly) {
    filtered = filtered.filter((m) => m.is_enabled);
  }
  if (supportedOnly) {
    filtered = filtered.filter((m) => m.is_supported);
  }

  // ── 4. Group by category ──────────────────────────────────────────────────
  const by_category = filtered.reduce<Record<string, AvailableModule[]>>(
    (acc, module) => {
      if (!acc[module.category]) acc[module.category] = [];
      acc[module.category]!.push(module);
      return acc;
    },
    {},
  ) as Record<ModuleCategory, AvailableModule[]>;

  // Sort each group by sort_order.
  for (const group of Object.values(by_category)) {
    group.sort((a, b) => a.sort_order - b.sort_order);
  }

  return {
    business_type: businessType,
    modules: filtered.sort((a, b) => a.sort_order - b.sort_order),
    by_category,
  };
}
