/**
 * Business Configuration Service
 *
 * Provides two reusable functions for reading and updating the
 * business_configuration table (created in migration 028):
 *
 *   getBusinessConfiguration(companyId)
 *   updateBusinessConfiguration(companyId, updates)
 *
 * Both functions use the Supabase service-role client so they bypass RLS
 * and are safe to call from any server-side context.
 *
 * NOTE: This service is intentionally unused in other modules for now.
 *       It is the foundation for future business-type-driven feature gating.
 */

import { supabase } from "./supabase.js";
import type {
  BusinessConfiguration,
  BusinessConfigurationUpdate,
  EnabledModules,
  DashboardLayout,
  FeatureFlags,
  BrandingConfig,
  AiConfiguration,
} from "@workspace/db";

// Re-export types so consumers can import from a single path.
export type {
  BusinessConfiguration,
  BusinessConfigurationUpdate,
  EnabledModules,
  DashboardLayout,
  FeatureFlags,
  BrandingConfig,
  AiConfiguration,
};

// ─── Errors ───────────────────────────────────────────────────────────────────

export class BusinessConfigurationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BusinessConfigurationError";
  }
}

// ─── getBusinessConfiguration ─────────────────────────────────────────────────

/**
 * Fetches the business_configuration row for the given company.
 *
 * Returns `null` when no row exists yet (e.g. a company created before
 * migration 028 was applied and the backfill INSERT failed silently).
 *
 * @param companyId  UUID of the company whose configuration to retrieve.
 * @throws {BusinessConfigurationError} on network or database errors.
 *
 * @example
 * const config = await getBusinessConfiguration("uuid-here");
 * if (config) {
 *   const { enabled_modules, ai_configuration } = config;
 * }
 */
export async function getBusinessConfiguration(
  companyId: string,
): Promise<BusinessConfiguration | null> {
  if (!companyId) {
    throw new BusinessConfigurationError(
      "companyId is required",
      "INVALID_ARGUMENT",
    );
  }

  const { data, error } = await supabase
    .from("business_configuration")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    throw new BusinessConfigurationError(
      `Failed to fetch business configuration for company ${companyId}`,
      "FETCH_FAILED",
      error,
    );
  }

  return (data as BusinessConfiguration | null);
}

// ─── updateBusinessConfiguration ─────────────────────────────────────────────

/**
 * Performs a partial update on the business_configuration row for the given
 * company.  Only the fields present in `updates` are modified; others are
 * left unchanged (Postgres UPDATE semantics).
 *
 * If no configuration row exists the function throws — callers should ensure
 * the trigger has fired (i.e. the company was created through the normal
 * onboard_user() flow).
 *
 * @param companyId  UUID of the company whose configuration to update.
 * @param updates    Partial set of columns to update (business_type and/or
 *                   any of the five JSONB blobs).
 * @returns          The fully-updated BusinessConfiguration row.
 * @throws {BusinessConfigurationError} when the row does not exist or the
 *                   update fails.
 *
 * @example
 * const updated = await updateBusinessConfiguration(companyId, {
 *   feature_flags: { ...existing.feature_flags, ai_proposals: true },
 * });
 */
export async function updateBusinessConfiguration(
  companyId: string,
  updates: Partial<BusinessConfigurationUpdate>,
): Promise<BusinessConfiguration> {
  if (!companyId) {
    throw new BusinessConfigurationError(
      "companyId is required",
      "INVALID_ARGUMENT",
    );
  }

  if (!updates || Object.keys(updates).length === 0) {
    throw new BusinessConfigurationError(
      "At least one field must be provided in updates",
      "INVALID_ARGUMENT",
    );
  }

  // Verify the row exists before attempting the update so we can return a
  // meaningful error rather than silently updating 0 rows.
  const existing = await getBusinessConfiguration(companyId);
  if (!existing) {
    throw new BusinessConfigurationError(
      `No business_configuration row found for company ${companyId}. ` +
        "Ensure the company was created through the standard onboarding flow.",
      "NOT_FOUND",
    );
  }

  const { data, error } = await supabase
    .from("business_configuration")
    .update({
      ...updates,
      // updated_at is handled by the set_updated_at() DB trigger; no need
      // to pass it here, but some PostgREST versions strip it — harmless.
    })
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) {
    throw new BusinessConfigurationError(
      `Failed to update business configuration for company ${companyId}`,
      "UPDATE_FAILED",
      error,
    );
  }

  return data as BusinessConfiguration;
}

// ─── Utility: merge JSONB blobs safely ───────────────────────────────────────

/**
 * Deep-merges `patch` into `base` one level deep (shallow merge of top-level
 * keys inside a JSONB blob).
 *
 * Useful when callers only want to flip individual feature flags without
 * having to provide the entire FeatureFlags object:
 *
 * @example
 * const updated = await updateBusinessConfiguration(companyId, {
 *   feature_flags: mergeJsonb(config.feature_flags, { ai_proposals: true }),
 * });
 */
export function mergeJsonb<T extends Record<string, unknown>>(
  base: T,
  patch: Partial<T>,
): T {
  return { ...base, ...patch };
}
