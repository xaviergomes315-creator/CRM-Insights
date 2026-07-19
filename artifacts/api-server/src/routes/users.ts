/**
 * POST /api/users
 *
 * Creates a new Supabase auth user and upserts a matching user_profiles row.
 * Requires the caller to be authenticated (Bearer token) and have an admin role.
 *
 * Body: { name: string, email: string, password: string, role: UserRole }
 */
import { Router } from "express";
import { supabase } from "../lib/supabase.js";

const router = Router();

const VALID_ROLES = [
  "super_admin",
  "company_admin",
  "manager",
  "employee",
] as const;
type ValidRole = (typeof VALID_ROLES)[number];

router.post("/users", async (req, res) => {
  // ── 1. Extract + validate Bearer token ──────────────────────────────────────
  const authHeader = req.headers["authorization"];
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

  if (!token) {
    res.status(401).json({ error: "Authorization header with Bearer token is required." });
    return;
  }

  // ── 2. Verify token & resolve caller identity ────────────────────────────────
  const {
    data: { user: caller },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !caller) {
    res.status(401).json({ error: "Invalid or expired token." });
    return;
  }

  // ── 3. Check caller has an admin role ────────────────────────────────────────
  const { data: callerProfile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("role, company_id")
    .eq("id", caller.id)
    .single();

  if (profileErr || !callerProfile) {
    res.status(403).json({ error: "Could not verify caller role." });
    return;
  }

  if (
    callerProfile.role !== "super_admin" &&
    callerProfile.role !== "company_admin"
  ) {
    res.status(403).json({ error: "Only admins can create users." });
    return;
  }

  // ── 4. Validate request body ─────────────────────────────────────────────────
  const { name, email, password, role } = req.body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required." });
    return;
  }
  if (
    !email ||
    typeof email !== "string" ||
    !email.trim().includes("@")
  ) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  if (
    !password ||
    typeof password !== "string" ||
    password.length < 6
  ) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }
  if (!role || !VALID_ROLES.includes(role as ValidRole)) {
    res.status(400).json({
      error: `role must be one of: ${VALID_ROLES.join(", ")}`,
    });
    return;
  }

  // ── 5. Create auth user via admin API (skips email confirmation) ─────────────
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { full_name: name.trim() },
  });

  if (createErr) {
    res.status(400).json({ error: createErr.message });
    return;
  }

  const newUserId = created.user.id;

  // ── 6. Upsert user_profiles ──────────────────────────────────────────────────
  const { error: upsertErr } = await supabase
    .from("user_profiles")
    .upsert(
      {
        id:         newUserId,
        full_name:  name.trim(),
        role:       role as ValidRole,
        company_id: callerProfile.company_id,
      },
      { onConflict: "id" },
    );

  if (upsertErr) {
    // Auth user was created — log the profile failure but still report partial success
    // so the caller knows the auth account exists.
    console.error("[users] profile upsert failed after auth user creation", upsertErr);
    res.status(207).json({
      warning: `User auth account created but profile update failed: ${upsertErr.message}`,
      userId: newUserId,
    });
    return;
  }

  res.status(201).json({ success: true, userId: newUserId });
});

export default router;
