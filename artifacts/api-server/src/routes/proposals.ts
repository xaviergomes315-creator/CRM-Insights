/**
 * POST /api/proposals/send-email
 *
 * Sends a proposal PDF to the client's email address via SMTP (nodemailer), then:
 *   - Updates the proposal status to "Sent"
 *   - Appends a proposal_activity record
 *
 * Body: { proposalId: string, pdfBase64: string }
 * Auth: Bearer <supabase-access-token>
 */
import { Router } from "express";
import nodemailer from "nodemailer";
import { supabase } from "../lib/supabase.js";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Escape user-controlled strings before inserting them into an HTML email. */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** UUID v4 pattern */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Roles that are permitted to send proposals. Employees (telecallers) are excluded. */
const SEND_ALLOWED_ROLES = new Set(["super_admin", "company_admin", "manager"]);

// ── Rate limiter (in-memory, per IP) ─────────────────────────────────────────
// Max 5 send-email requests per IP per 15-minute window.
// Prevents SMTP exhaustion and spam amplification without an extra dependency.

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX       = 5;

interface RateLimitEntry { count: number; resetAt: number }
const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(ip: string): boolean {
  const now   = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Periodically purge expired entries so the map does not grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, RATE_LIMIT_WINDOW_MS);

// ── Route ─────────────────────────────────────────────────────────────────────

router.post("/proposals/send-email", async (req, res) => {
  // ── 0. Rate limit ────────────────────────────────────────────────────────────
  const clientIp =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  if (!checkRateLimit(clientIp)) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  // ── 1. Extract & verify Bearer token ─────────────────────────────────────────
  const authHeader = req.headers["authorization"];
  const token =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

  if (!token) {
    res.status(401).json({ error: "Authorization header with Bearer token is required." });
    return;
  }

  const {
    data: { user: caller },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !caller) {
    res.status(401).json({ error: "Invalid or expired token." });
    return;
  }

  // ── 2. Resolve caller's company and role ──────────────────────────────────────
  const { data: callerProfile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("company_id, role")
    .eq("id", caller.id)
    .single();

  if (profileErr || !callerProfile?.company_id) {
    res.status(403).json({ error: "Could not verify caller company." });
    return;
  }

  const companyId    = callerProfile.company_id as string;
  const callerRole   = callerProfile.role as string;

  // ── 3. Role-based permission check ───────────────────────────────────────────
  if (!SEND_ALLOWED_ROLES.has(callerRole)) {
    res.status(403).json({ error: "You do not have permission to send proposals." });
    return;
  }

  // ── 4. Validate request body ─────────────────────────────────────────────────
  const { proposalId, pdfBase64 } = req.body ?? {};

  if (!proposalId || typeof proposalId !== "string" || !UUID_RE.test(proposalId)) {
    res.status(400).json({ error: "proposalId must be a valid UUID." });
    return;
  }

  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    res.status(400).json({ error: "pdfBase64 is required and must be a string." });
    return;
  }

  // Guard against oversized payloads slipping past the body-size middleware.
  // Base64 overhead is ~33 %; 10 MB base64 ≈ 7.5 MB binary.
  const MAX_BASE64_BYTES = 10 * 1024 * 1024;
  if (Buffer.byteLength(pdfBase64, "utf8") > MAX_BASE64_BYTES) {
    res.status(400).json({ error: "PDF payload exceeds the 10 MB limit." });
    return;
  }

  // ── 5. Fetch proposal & verify ownership ──────────────────────────────────────
  const { data: proposal, error: proposalErr } = await supabase
    .from("proposals")
    .select("id, company_id, client_name, client_email, proposal_number, status")
    .eq("id", proposalId)
    .is("deleted_at", null)
    .single();

  if (proposalErr || !proposal) {
    res.status(404).json({ error: "Proposal not found." });
    return;
  }

  if (proposal.company_id !== companyId) {
    res.status(403).json({ error: "Access denied." });
    return;
  }

  const clientEmail = proposal.client_email as string;
  if (!clientEmail) {
    res.status(400).json({ error: "This proposal has no client email address." });
    return;
  }

  // ── 6. Fetch company for sender details ───────────────────────────────────────
  const { data: company } = await supabase
    .from("companies")
    .select("name, email")
    .eq("id", companyId)
    .single();

  const companyName = (company?.name as string | null) ?? "CRM Pro";
  // SMTP_FROM is optional — falls back to SMTP_USER (the sending account)
  const fromEmail =
    (process.env["SMTP_FROM"] ?? "").trim() ||
    (process.env["SMTP_USER"] ?? "").trim();

  const proposalNumber = proposal.proposal_number as string;
  const clientName     = (proposal.client_name as string) || "there";

  // ── 7. Send email via SMTP (nodemailer) ───────────────────────────────────────
  const smtpHost = process.env["SMTP_HOST"]?.trim();
  const smtpPort = parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  const smtpUser = process.env["SMTP_USER"]?.trim();
  const smtpPass = process.env["SMTP_PASS"]?.trim();

  if (!smtpHost || !smtpUser || !smtpPass) {
    res.status(503).json({ code: "EMAIL_NOT_CONFIGURED", error: "Email service is not configured." });
    return;
  }

  // Escape all user-controlled values before embedding them in HTML.
  const safeCompanyName    = escapeHtml(companyName);
  const safeClientName     = escapeHtml(clientName);
  const safeProposalNumber = escapeHtml(proposalNumber);

  const emailHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="color:#4F46E5;margin-bottom:4px">${safeCompanyName}</h2>
      <hr style="border:none;border-top:2px solid #4F46E5;margin-bottom:24px"/>
      <p>Dear ${safeClientName},</p>
      <p>
        Please find attached our proposal <strong>${safeProposalNumber}</strong>
        prepared for you. We look forward to working together.
      </p>
      <p>If you have any questions, please reply to this email or contact us directly.</p>
      <br/>
      <p style="color:#6B7280;font-size:13px">— ${safeCompanyName}</p>
    </div>
  `.trim();

  let emailError: string | null = null;

  try {
    const transporter = nodemailer.createTransport({
      host:   smtpHost,
      port:   smtpPort,
      secure: smtpPort === 465,
      auth:   { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from:    fromEmail,
      to:      clientEmail,
      subject: `Proposal ${safeProposalNumber} from ${safeCompanyName}`,
      html:    emailHtml,
      attachments: [
        {
          filename:    `Proposal-${proposalNumber}.pdf`,
          content:     Buffer.from(pdfBase64, "base64"),
          contentType: "application/pdf",
        },
      ],
    });
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
  }

  if (emailError) {
    console.error("[proposals/send-email] email send failed:", emailError);
    res.status(502).json({ error: `Failed to send email: ${emailError}` });
    return;
  }

  // ── 8. Update proposal status to "Sent" ───────────────────────────────────────
  // Both writes are attempted independently so the activity log is still recorded
  // even if the status update encounters a transient error, and vice versa.
  const oldStatus = proposal.status as string;

  const { error: updateErr } = await supabase
    .from("proposals")
    .update({ status: "Sent" })
    .eq("id", proposalId);

  if (updateErr) {
    console.error("[proposals/send-email] failed to update proposal status:", updateErr.message);
    // Email was already sent — return a partial success so the client can inform the user.
    res.status(207).json({
      success: true,
      sentTo:  clientEmail,
      warning: "Email sent but proposal status could not be updated. Refresh and verify.",
    });
    return;
  }

  // ── 9. Append activity record ─────────────────────────────────────────────────
  const { error: activityErr } = await supabase.from("proposal_activity").insert({
    proposal_id:  proposalId,
    action:       "sent",
    old_value:    { status: oldStatus },
    new_value:    { status: "Sent", recipient: clientEmail },
    performed_by: caller.id,
  });

  if (activityErr) {
    // Non-fatal — the email was sent and status updated; just log the failure.
    console.error("[proposals/send-email] failed to insert activity record:", activityErr.message);
  }

  res.status(200).json({ success: true, sentTo: clientEmail });
});

export default router;
