/**
 * POST /api/proposals/send-email
 *
 * Sends a proposal PDF to the client's email address via Resend, then:
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

router.post("/proposals/send-email", async (req, res) => {
  // ── 1. Extract & verify Bearer token ────────────────────────────────────────
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

  // ── 2. Resolve caller's company ──────────────────────────────────────────────
  const { data: callerProfile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("company_id")
    .eq("id", caller.id)
    .single();

  if (profileErr || !callerProfile?.company_id) {
    res.status(403).json({ error: "Could not verify caller company." });
    return;
  }

  const companyId = callerProfile.company_id as string;

  // ── 3. Validate request body ─────────────────────────────────────────────────
  const { proposalId, pdfBase64 } = req.body ?? {};

  if (!proposalId || typeof proposalId !== "string") {
    res.status(400).json({ error: "proposalId is required." });
    return;
  }
  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    res.status(400).json({ error: "pdfBase64 is required." });
    return;
  }

  // ── 4. Fetch proposal & verify ownership ─────────────────────────────────────
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

  // ── 5. Fetch company for sender details ──────────────────────────────────────
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

  // ── 6. Send email via SMTP (nodemailer) ──────────────────────────────────────
  const smtpHost = process.env["SMTP_HOST"]?.trim();
  const smtpPort = parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  const smtpUser = process.env["SMTP_USER"]?.trim();
  const smtpPass = process.env["SMTP_PASS"]?.trim();

  if (!smtpHost || !smtpUser || !smtpPass) {
    res.status(503).json({ code: "EMAIL_NOT_CONFIGURED", error: "Email service is not configured." });
    return;
  }

  const emailHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111827">
      <h2 style="color:#4F46E5;margin-bottom:4px">${companyName}</h2>
      <hr style="border:none;border-top:2px solid #4F46E5;margin-bottom:24px"/>
      <p>Dear ${clientName},</p>
      <p>
        Please find attached our proposal <strong>${proposalNumber}</strong>
        prepared for you. We look forward to working together.
      </p>
      <p>If you have any questions, please reply to this email or contact us directly.</p>
      <br/>
      <p style="color:#6B7280;font-size:13px">— ${companyName}</p>
    </div>
  `.trim();

  let emailError: string | null = null;

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from:    fromEmail,
      to:      clientEmail,
      subject: `Proposal ${proposalNumber} from ${companyName}`,
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

  // ── 7. Update proposal status to "Sent" ──────────────────────────────────────
  const oldStatus = proposal.status as string;

  await supabase
    .from("proposals")
    .update({ status: "Sent" })
    .eq("id", proposalId);

  // ── 8. Append activity record ────────────────────────────────────────────────
  await supabase.from("proposal_activity").insert({
    proposal_id:  proposalId,
    action:       "sent",
    old_value:    { status: oldStatus },
    new_value:    { status: "Sent", recipient: clientEmail },
    performed_by: caller.id,
  });

  res.status(200).json({ success: true, sentTo: clientEmail });
});

export default router;
