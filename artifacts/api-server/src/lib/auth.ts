/**
 * Shared authentication helper for Express route handlers.
 *
 * Usage:
 *   const auth = await requireAuth(req, res);
 *   if (!auth) return;   // response already written
 *   const { callerId, companyId, role } = auth;
 */
import type { Request, Response } from "express";
import { supabase } from "./supabase.js";

export interface CallerContext {
  callerId:  string;
  companyId: string;
  role:      string;
}

/**
 * Extracts and verifies the Bearer token, then resolves the caller's
 * company_id and role from user_profiles.
 *
 * On failure, writes the appropriate HTTP error response and returns null.
 * The caller must `return` immediately when null is received.
 */
export async function requireAuth(
  req: Request,
  res: Response,
): Promise<CallerContext | null> {
  // ── 1. Extract Bearer token ────────────────────────────────────────────────
  const authHeader = req.headers["authorization"];
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

  if (!token) {
    res.status(401).json({ error: "Authorization header with Bearer token is required." });
    return null;
  }

  // ── 2. Verify token with Supabase ──────────────────────────────────────────
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    res.status(401).json({ error: "Invalid or expired token." });
    return null;
  }

  // ── 3. Resolve company and role ────────────────────────────────────────────
  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile?.company_id) {
    res.status(403).json({ error: "Could not verify caller company." });
    return null;
  }

  return {
    callerId:  user.id,
    companyId: profile.company_id as string,
    role:      profile.role      as string,
  };
}

/** Roles permitted to perform manager-level operations */
export const MANAGER_ROLES = new Set([
  "super_admin",
  "company_admin",
  "manager",
]);
