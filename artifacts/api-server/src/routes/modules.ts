/**
 * GET /api/modules/visible
 *
 * Returns the CRM modules that should appear in the sidebar for the
 * authenticated user's company. Applies the full getVisibleModules() filter:
 *   • production_ready = true
 *   • hidden = false
 *   • is_enabled = true  (per business_configuration row)
 *   • required_permissions includes the caller's role
 *
 * Fail-open: if business_configuration cannot be loaded (e.g. Supabase is
 * not yet configured), the service falls back to registry defaults so the
 * sidebar is never empty.
 *
 * Requires: Authorization: Bearer <supabase_jwt>
 */
import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { getVisibleModules } from "../lib/module-registry.js";
import type { UserRole } from "@workspace/db";

const router = Router();

router.get("/modules/visible", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const result = await getVisibleModules(
      auth.companyId,
      auth.role as UserRole,
    );
    res.json(result);
  } catch (err) {
    console.error("[modules] getVisibleModules error:", err);
    res.status(500).json({ error: "Failed to load module configuration." });
  }
});

export default router;
