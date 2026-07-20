/**
 * WhatsApp Cloud API webhook handlers
 *
 * GET  /api/whatsapp/webhook  — Meta hub challenge verification
 * POST /api/whatsapp/webhook  — Inbound events (status updates + incoming text messages)
 *
 * No Supabase Auth — Meta calls these endpoints directly.
 * HMAC-SHA256 signature validation is performed when WHATSAPP_APP_SECRET is set.
 *
 * Required env vars:
 *   WHATSAPP_VERIFY_TOKEN    — Token set in the Meta App dashboard (GET verification)
 *   WHATSAPP_APP_SECRET      — Meta App Secret for HMAC validation (optional but recommended)
 *   WHATSAPP_COMPANY_ID      — UUID of the company that owns this WhatsApp number
 *                              (used to create conversations for unknown contacts)
 *   WHATSAPP_SYSTEM_USER_ID  — UUID of a valid auth.users row used as created_by for
 *                              webhook-created conversations (satisfies the NOT NULL FK)
 */
import { createHmac, timingSafeEqual } from "crypto";
import { Router }                       from "express";
import { supabase }                     from "../lib/supabase.js";

const router = Router();

// ── Status rank ───────────────────────────────────────────────────────────────
// Prevents a late-arriving "sent" webhook from overwriting an already-"delivered"
// or "read" status. Failed is always written (rank -1 = unconditional).
const STATUS_RANK: Record<string, number> = {
  pending:   0,
  sent:      1,
  delivered: 2,
  read:      3,
  failed:   -1, // unconditional write
};

// ── GET /api/whatsapp/webhook ─────────────────────────────────────────────────
// Meta sends a GET request with a hub challenge when you register or modify the
// webhook subscription. Respond with the challenge to confirm ownership.

router.get("/whatsapp/webhook", (req, res) => {
  const mode      = req.query["hub.mode"]         as string | undefined;
  const token     = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"]    as string | undefined;

  const verifyToken = process.env["WHATSAPP_VERIFY_TOKEN"]?.trim();

  if (!verifyToken) {
    console.error("[wa-webhook] WHATSAPP_VERIFY_TOKEN is not set — cannot verify.");
    res.status(500).send("Webhook verification not configured on this server.");
    return;
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.info("[wa-webhook] Hub challenge verified successfully.");
    res.status(200).send(challenge ?? "");
    return;
  }

  console.warn(
    "[wa-webhook] Hub challenge failed — mode=%s token_match=%s.",
    mode,
    token === verifyToken,
  );
  res.status(403).send("Webhook verification failed.");
});

// ── POST /api/whatsapp/webhook ────────────────────────────────────────────────
// Meta delivers events here: message status updates and incoming messages.
// Always responds 200 OK immediately; all DB work runs after the response
// so latency never causes Meta to retry unnecessarily.

router.post("/whatsapp/webhook", async (req, res) => {
  // ── 0. HMAC-SHA256 signature validation ────────────────────────────────────
  // Skipped when WHATSAPP_APP_SECRET is absent (dev/staging convenience).
  // In production this should always be configured.
  const appSecret = process.env["WHATSAPP_APP_SECRET"]?.trim();
  if (appSecret) {
    const sigHeader = req.headers["x-hub-signature-256"] as string | undefined;
    // rawBody is attached by the express.json verify callback in app.ts
    const rawBody = (req as { rawBody?: Buffer }).rawBody;

    if (!sigHeader || !rawBody) {
      console.warn("[wa-webhook] Rejected — missing X-Hub-Signature-256 or raw body.");
      res.status(401).send("Missing signature.");
      return;
    }

    const expected = "sha256=" + createHmac("sha256", appSecret)
      .update(rawBody)
      .digest("hex");

    // Timing-safe comparison prevents length-based side-channel attacks.
    const sigBuf = Buffer.from(sigHeader, "utf8");
    const expBuf = Buffer.from(expected,  "utf8");

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      console.warn("[wa-webhook] Rejected — HMAC signature mismatch.");
      res.status(401).send("Invalid signature.");
      return;
    }
  }

  // ── 1. Acknowledge immediately ─────────────────────────────────────────────
  // Meta requires 200 within 20 s or it retries with exponential back-off.
  res.status(200).send("OK");

  // ── 2. Guard basic envelope shape ─────────────────────────────────────────
  const payload = req.body as Record<string, unknown>;
  if (payload["object"] !== "whatsapp_business_account") return;

  const entries = payload["entry"];
  if (!Array.isArray(entries)) return;

  // ── 3. Iterate entries → changes ──────────────────────────────────────────
  for (const entry of entries) {
    const changes = (entry as Record<string, unknown>)["changes"];
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const changeRec = change as Record<string, unknown>;
      if (changeRec["field"] !== "messages") continue;

      const value = changeRec["value"] as Record<string, unknown> | undefined;
      if (!value) continue;

      const contacts = value["contacts"] as Record<string, unknown>[] | undefined;

      // ── 3a. Delivery status updates ───────────────────────────────────────
      const statuses = value["statuses"];
      if (Array.isArray(statuses)) {
        for (const s of statuses) {
          try {
            await handleStatusUpdate(s as Record<string, unknown>);
          } catch (err) {
            console.error("[wa-webhook] Unhandled error in handleStatusUpdate:", err);
          }
        }
      }

      // ── 3b. Incoming messages ─────────────────────────────────────────────
      const messages = value["messages"];
      if (Array.isArray(messages)) {
        for (const m of messages) {
          try {
            await handleIncomingMessage(m as Record<string, unknown>, contacts);
          } catch (err) {
            console.error("[wa-webhook] Unhandled error in handleIncomingMessage:", err);
          }
        }
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// handleStatusUpdate
//
// Updates the delivery status of an outgoing message identified by its wamid
// (external_id). Only advances the status — never regresses it — to handle
// duplicate or out-of-order webhook deliveries safely.
// ─────────────────────────────────────────────────────────────────────────────

async function handleStatusUpdate(statusObj: Record<string, unknown>): Promise<void> {
  const wamid     = statusObj["id"]     as string | undefined;
  const rawStatus = statusObj["status"] as string | undefined;

  if (!wamid || !rawStatus) {
    console.warn("[wa-webhook] Status update missing id or status — skipping.");
    return;
  }

  // Map Meta's status strings to our schema values
  const STATUS_MAP: Record<string, string> = {
    sent:      "sent",
    delivered: "delivered",
    read:      "read",
    failed:    "failed",
  };
  const mappedStatus = STATUS_MAP[rawStatus];
  if (!mappedStatus) {
    console.info("[wa-webhook] Unrecognised status '%s' for wamid %s — ignoring.", rawStatus, wamid);
    return;
  }

  // ── Look up the message row ──────────────────────────────────────────────
  const { data: rows, error: fetchErr } = await supabase
    .from("whatsapp_messages")
    .select("id, status, company_id")
    .eq("external_id", wamid)
    .limit(1);

  if (fetchErr) {
    console.error("[wa-webhook] DB error fetching message for wamid %s:", wamid, fetchErr.message);
    return;
  }

  const existing = rows?.[0];
  if (!existing) {
    // Sent by a different system or unknown channel — nothing to update.
    console.info("[wa-webhook] No message row found for wamid %s — skipping.", wamid);
    return;
  }

  // ── Deduplication / anti-regression guard ───────────────────────────────
  // All statuses only advance; "failed" also never overwrites confirmed delivery.
  // A late/spurious "failed" webhook arriving after "delivered" or "read" must not
  // regress the message — the recipient already received it.
  const currentRank  = STATUS_RANK[existing.status as string] ?? 0;
  const incomingRank = STATUS_RANK[mappedStatus]              ?? 0;

  if (mappedStatus !== "failed" && incomingRank <= currentRank) {
    console.info(
      "[wa-webhook] Skipping status '%s' for wamid %s (current: '%s', no advancement).",
      mappedStatus, wamid, existing.status,
    );
    return;
  }

  if (
    mappedStatus === "failed" &&
    (existing.status === "delivered" || existing.status === "read")
  ) {
    console.info(
      "[wa-webhook] Skipping late 'failed' for wamid %s — already '%s'.",
      wamid, existing.status,
    );
    return;
  }

  // ── Extract error details (failed only) ─────────────────────────────────
  const errors      = statusObj["errors"] as Record<string, unknown>[] | undefined;
  const firstErr    = errors?.[0];
  const errorCode   = firstErr ? String(firstErr["code"]    ?? "") : null;
  const errorMsg    = firstErr ? String(firstErr["title"]   ?? firstErr["message"] ?? "") : null;

  // ── Patch the message row ────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("whatsapp_messages")
    .update({
      status:            mappedStatus,
      status_updated_at: new Date().toISOString(),
      error_code:        mappedStatus === "failed" ? errorCode : null,
      error_message:     mappedStatus === "failed" ? errorMsg  : null,
    })
    .eq("id",         existing.id as string)
    .eq("company_id", existing.company_id as string); // tenant guard

  if (updateErr) {
    console.error(
      "[wa-webhook] Failed to update status '%s' for wamid %s:", mappedStatus, wamid, updateErr.message,
    );
  } else {
    console.info("[wa-webhook] Status '%s' applied to wamid %s.", mappedStatus, wamid);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// handleIncomingMessage
//
// Persists an incoming text message. Finds or creates the conversation by the
// sender's phone number. Duplicate wamids are silently discarded — the unique
// constraint on (company_id, external_id) is the final safety net if the
// application-level check races.
// ─────────────────────────────────────────────────────────────────────────────

async function handleIncomingMessage(
  msgObj:   Record<string, unknown>,
  contacts: Record<string, unknown>[] | undefined,
): Promise<void> {
  const wamid   = msgObj["id"]   as string | undefined;
  const from    = msgObj["from"] as string | undefined; // digits only, no "+"
  const msgType = msgObj["type"] as string | undefined;

  if (!wamid || !from) {
    console.warn("[wa-webhook] Incoming message missing id or from — skipping.");
    return;
  }

  // Only text messages are handled; other types are logged and skipped.
  if (msgType !== "text") {
    console.info(
      "[wa-webhook] Incoming '%s' message from %s — type not yet handled, skipping.",
      msgType, from,
    );
    return;
  }

  const textBody =
    ((msgObj["text"] as Record<string, unknown> | undefined)?.["body"] ?? "") as string;

  // ── Application-level duplicate check ───────────────────────────────────
  // A DB-level unique constraint provides the final guarantee; this check
  // avoids a wasted insert attempt on routine retry deliveries.
  const { data: dupRows } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("external_id", wamid)
    .limit(1);

  if (dupRows && dupRows.length > 0) {
    console.info("[wa-webhook] Duplicate wamid %s — already ingested, skipping.", wamid);
    return;
  }

  // ── Normalise phone number ───────────────────────────────────────────────
  // Meta sends digits without "+"; our DB stores the full E.164 form with "+".
  // We check both forms so existing conversations match regardless of how the
  // phone was originally entered by the user.
  const fromWithPlus    = from.startsWith("+") ? from        : `+${from}`;
  const fromWithoutPlus = from.startsWith("+") ? from.slice(1) : from;

  // ── Find or create conversation ──────────────────────────────────────────
  const { data: convRows, error: convFetchErr } = await supabase
    .from("whatsapp_conversations")
    .select("id, company_id")
    .or(`contact_phone.eq.${fromWithPlus},contact_phone.eq.${fromWithoutPlus}`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false }) // prefer most-recent if duplicates exist
    .limit(1);

  if (convFetchErr) {
    console.error(
      "[wa-webhook] DB error looking up conversation for %s:", fromWithPlus, convFetchErr.message,
    );
    return;
  }

  let conversationId: string;
  let companyId:      string;

  if (convRows && convRows.length > 0) {
    // ── Known contact — reuse existing conversation ──────────────────────
    conversationId = convRows[0].id      as string;
    companyId      = convRows[0].company_id as string;
  } else {
    // ── Unknown contact — create a new conversation ──────────────────────
    // Requires WHATSAPP_COMPANY_ID and WHATSAPP_SYSTEM_USER_ID to satisfy
    // the NOT NULL FKs (company_id → companies, created_by → auth.users).
    const configuredCompanyId  = process.env["WHATSAPP_COMPANY_ID"]?.trim()     ?? "";
    const configuredSystemUser = process.env["WHATSAPP_SYSTEM_USER_ID"]?.trim() ?? "";

    if (!configuredCompanyId || !configuredSystemUser) {
      console.warn(
        "[wa-webhook] Cannot create conversation for unknown contact %s — " +
        "WHATSAPP_COMPANY_ID and WHATSAPP_SYSTEM_USER_ID must both be set.",
        fromWithPlus,
      );
      return;
    }

    // Resolve display name from Meta's contacts array (wa_id matches "from")
    const contactEntry = contacts?.find(
      (c) =>
        (c["wa_id"] as string | undefined) === from ||
        (c["wa_id"] as string | undefined) === fromWithPlus,
    );
    const contactName =
      ((contactEntry?.["profile"] as Record<string, unknown> | undefined)?.["name"] as
        | string
        | undefined) ?? fromWithPlus;

    const { data: newConv, error: createErr } = await supabase
      .from("whatsapp_conversations")
      .insert({
        company_id:      configuredCompanyId,
        contact_name:    contactName,
        contact_phone:   fromWithPlus,
        status:          "active",
        last_message_at: new Date().toISOString(),
        created_by:      configuredSystemUser,
      })
      .select("id, company_id")
      .single();

    if (createErr || !newConv) {
      console.error(
        "[wa-webhook] Failed to create conversation for %s:", fromWithPlus, createErr?.message,
      );
      return;
    }

    conversationId = newConv.id         as string;
    companyId      = newConv.company_id as string;
    console.info(
      "[wa-webhook] Created new conversation %s for unknown contact %s.",
      conversationId, fromWithPlus,
    );
  }

  // ── Insert incoming message ──────────────────────────────────────────────
  const now = new Date().toISOString();

  const { error: insertErr } = await supabase
    .from("whatsapp_messages")
    .insert({
      conversation_id:   conversationId,
      company_id:        companyId,
      direction:         "incoming",
      message_type:      "text",
      body:              textBody,
      external_id:       wamid,
      status:            "received",
      status_updated_at: now,
      sent_by:           null, // NULL for incoming — enforced by DB CHECK constraint
    });

  if (insertErr) {
    // Unique constraint violation (23505) means a concurrent delivery beat us —
    // treat as a harmless duplicate rather than an error.
    if ((insertErr as { code?: string }).code === "23505") {
      console.info(
        "[wa-webhook] Race-condition duplicate for wamid %s — ignored.", wamid,
      );
      return;
    }
    console.error(
      "[wa-webhook] Failed to insert incoming message %s:", wamid, insertErr.message,
    );
    return;
  }

  // ── Advance conversation.last_message_at ────────────────────────────────
  const { error: tsErr } = await supabase
    .from("whatsapp_conversations")
    .update({ last_message_at: now })
    .eq("id",         conversationId)
    .eq("company_id", companyId); // tenant guard

  if (tsErr) {
    // Non-fatal — message is stored; inbox sort order may lag until next event.
    console.error(
      "[wa-webhook] Failed to update last_message_at for conversation %s:", conversationId, tsErr.message,
    );
  }

  console.info(
    "[wa-webhook] Incoming text from %s stored in conversation %s (wamid %s).",
    fromWithPlus, conversationId, wamid,
  );
}

export default router;
