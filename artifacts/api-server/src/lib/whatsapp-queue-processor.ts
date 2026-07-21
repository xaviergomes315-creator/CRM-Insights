/**
 * WhatsApp Message Queue Processor
 *
 * Runs as a background loop inside the API server process. On each tick
 * it atomically claims one pending queue item (via a Postgres function
 * that uses FOR UPDATE SKIP LOCKED), sends it through the Meta WhatsApp
 * Cloud API, creates the resulting whatsapp_messages row, then marks the
 * queue item as "sent" or "failed".
 *
 * Exactly one message is sent per tick. The interval is set to 2 seconds
 * which stays well within Meta's default throughput limits and ensures
 * the queue drains steadily without bursting.
 *
 * Resilience:
 *   - Startup credential check: if SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *     are absent the processor does not start, preventing log flooding.
 *   - Exponential back-off: consecutive claim errors double the wait between
 *     ticks (capped at MAX_BACKOFF_MS = 60 s).
 *   - Circuit breaker: after CIRCUIT_OPEN_AFTER consecutive claim errors the
 *     processor stops entirely and emits a single CIRCUIT OPEN log line.
 *
 * Usage:
 *   import { startQueueProcessor } from "./whatsapp-queue-processor.js";
 *   startQueueProcessor();   // call once at server startup
 */

import { supabase } from "./supabase.js";

// ── Meta Cloud API config ──────────────────────────────────────────────────────

const META_API_VERSION = "v20.0";
const META_API_BASE    = "https://graph.facebook.com";

// ── Internal result types ──────────────────────────────────────────────────────

type MetaSuccess = { wamid: string };
type MetaFailure = { errorCode: string; errorMessage: string };
type MetaResult  = MetaSuccess | MetaFailure;

/** Return value of processNextItem distinguishes three outcomes. */
type TickResult = "processed" | "empty" | "error";

function isMetaSuccess(r: MetaResult): r is MetaSuccess {
  return "wamid" in r;
}

// ── Meta API helpers ───────────────────────────────────────────────────────────

async function sendTextViaMetaApi(
  to:            string,
  body:          string,
  accessToken:   string,
  phoneNumberId: string,
): Promise<MetaResult> {
  const url = `${META_API_BASE}/${META_API_VERSION}/${phoneNumberId}/messages`;

  let httpRes: Response;
  try {
    httpRes = await fetch(url, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type:    "individual",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
    });
  } catch (err) {
    return { errorCode: "NETWORK_ERROR", errorMessage: err instanceof Error ? err.message : String(err) };
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await httpRes.json()) as Record<string, unknown>;
  } catch {
    return { errorCode: "PARSE_ERROR", errorMessage: `Meta API HTTP ${httpRes.status} returned non-JSON` };
  }

  if (httpRes.ok) {
    const messages = payload["messages"];
    const wamid = Array.isArray(messages) && messages.length > 0
      ? (messages[0] as Record<string, unknown>)["id"]
      : undefined;
    if (typeof wamid === "string" && wamid) return { wamid };
    return { errorCode: "UNEXPECTED_RESPONSE", errorMessage: "No wamid in Meta response" };
  }

  const errObj = payload["error"] as Record<string, unknown> | undefined;
  return {
    errorCode:    String(errObj?.["code"]    ?? httpRes.status),
    errorMessage: String(errObj?.["message"] ?? `HTTP ${httpRes.status}`),
  };
}

async function sendTemplateViaMetaApi(
  to:            string,
  templateName:  string,
  languageCode:  string,
  params:        string[],
  accessToken:   string,
  phoneNumberId: string,
): Promise<MetaResult> {
  const url = `${META_API_BASE}/${META_API_VERSION}/${phoneNumberId}/messages`;

  const components: Record<string, unknown>[] = params.length > 0
    ? [{ type: "body", parameters: params.map(text => ({ type: "text", text })) }]
    : [];

  let httpRes: Response;
  try {
    httpRes = await fetch(url, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type:    "individual",
        to,
        type: "template",
        template: { name: templateName, language: { code: languageCode }, components },
      }),
    });
  } catch (err) {
    return { errorCode: "NETWORK_ERROR", errorMessage: err instanceof Error ? err.message : String(err) };
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await httpRes.json()) as Record<string, unknown>;
  } catch {
    return { errorCode: "PARSE_ERROR", errorMessage: `Meta API HTTP ${httpRes.status} returned non-JSON` };
  }

  if (httpRes.ok) {
    const messages = payload["messages"];
    const wamid = Array.isArray(messages) && messages.length > 0
      ? (messages[0] as Record<string, unknown>)["id"]
      : undefined;
    if (typeof wamid === "string" && wamid) return { wamid };
    return { errorCode: "UNEXPECTED_RESPONSE", errorMessage: "No wamid in Meta response" };
  }

  const errObj = payload["error"] as Record<string, unknown> | undefined;
  return {
    errorCode:    String(errObj?.["code"]    ?? httpRes.status),
    errorMessage: String(errObj?.["message"] ?? `HTTP ${httpRes.status}`),
  };
}

// ── Core processor ─────────────────────────────────────────────────────────────

/**
 * Claims and processes the next pending queue item.
 * Returns:
 *   "processed" — an item was found and handled (success or business failure)
 *   "empty"     — the queue had no pending items
 *   "error"     — a claim-level network/DB error occurred (triggers back-off)
 * Never throws — all errors are caught internally.
 */
async function processNextItem(): Promise<TickResult> {
  // ── 1. Atomically claim one pending item ───────────────────────────────────
  let item: Record<string, unknown>;
  try {
    const { data, error } = await supabase.rpc("claim_next_wa_queue_item");
    if (error) {
      console.error("[wa-queue] claim error:", error.message);
      return "error";
    }
    if (!Array.isArray(data) || data.length === 0) return "empty"; // queue empty
    item = data[0] as Record<string, unknown>;
  } catch (err) {
    console.error("[wa-queue] unexpected claim error:", err);
    return "error";
  }

  const itemId         = item["id"]              as string;
  const companyId      = item["company_id"]      as string;
  const conversationId = item["conversation_id"] as string;
  const createdBy      = item["created_by"]      as string;
  const messageType    = item["message_type"]    as "text" | "template";
  const body           = item["body"]            as string;
  const templateId     = item["template_id"]     as string | null;
  const templateParams = (item["template_params"] as unknown[] | null) ?? [];

  console.info("[wa-queue] processing item %s (type: %s)", itemId, messageType);

  // ── 2. Fetch conversation ──────────────────────────────────────────────────
  const { data: conv, error: convErr } = await supabase
    .from("whatsapp_conversations")
    .select("contact_phone, status")
    .eq("id", conversationId)
    .single();

  if (convErr || !conv) {
    await markFailed(itemId, "CONV_NOT_FOUND", "Conversation not found.");
    return "processed";
  }
  if ((conv["status"] as string) === "blocked") {
    await markFailed(itemId, "CONV_BLOCKED", "Conversation is blocked.");
    return "processed";
  }

  const contactPhone = conv["contact_phone"] as string;

  // ── 3. Resolve credentials ─────────────────────────────────────────────────
  const accessToken   = process.env["WHATSAPP_ACCESS_TOKEN"]?.trim()    ?? "";
  const phoneNumberId = process.env["WHATSAPP_PHONE_NUMBER_ID"]?.trim() ?? "";

  // ── 4. Resolve content + call Meta ────────────────────────────────────────
  let metaResult: MetaResult;
  let resolvedBody        = body;
  let resolvedTemplateName: string | null = null;

  if (messageType === "template") {
    // Validate template_id is present
    if (!templateId) {
      await markFailed(itemId, "NO_TEMPLATE_ID", "template_id is required for template messages.");
      return "processed";
    }

    // Fetch template
    const { data: tpl, error: tplErr } = await supabase
      .from("whatsapp_templates")
      .select("name, language, status, body_text")
      .eq("id", templateId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .single();

    if (tplErr || !tpl) {
      await markFailed(itemId, "TEMPLATE_NOT_FOUND", "Template not found.");
      return "processed";
    }
    if ((tpl["status"] as string) !== "approved") {
      await markFailed(itemId, "TEMPLATE_NOT_APPROVED",
        `Template status is "${tpl["status"]}", must be "approved".`);
      return "processed";
    }

    resolvedTemplateName = tpl["name"] as string;
    const languageCode   = tpl["language"] as string;
    const bodyText       = tpl["body_text"] as string;

    // Render body for the message record
    resolvedBody = bodyText.replace(/\{\{(\d+)\}\}/g, (match, n) => {
      const val = (templateParams[parseInt(n, 10) - 1] as string | undefined) ?? "";
      return val.trim() !== "" ? val : match;
    });

    if (!accessToken || !phoneNumberId) {
      // No Meta credentials — store the message as pending so the row exists
      metaResult = { errorCode: "NOT_CONFIGURED", errorMessage: "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set." };
    } else {
      metaResult = await sendTemplateViaMetaApi(
        contactPhone,
        resolvedTemplateName,
        languageCode,
        templateParams.map(String),
        accessToken,
        phoneNumberId,
      );
    }
  } else {
    // text
    if (!body.trim()) {
      await markFailed(itemId, "EMPTY_BODY", "Message body is empty.");
      return "processed";
    }

    if (!accessToken || !phoneNumberId) {
      metaResult = { errorCode: "NOT_CONFIGURED", errorMessage: "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set." };
    } else {
      metaResult = await sendTextViaMetaApi(contactPhone, body, accessToken, phoneNumberId);
    }
  }

  // ── 5. Insert whatsapp_messages row ───────────────────────────────────────
  const now       = new Date().toISOString();
  const succeeded = isMetaSuccess(metaResult);

  const { data: msgRow, error: msgErr } = await supabase
    .from("whatsapp_messages")
    .insert({
      conversation_id:   conversationId,
      company_id:        companyId,
      direction:         "outgoing",
      message_type:      messageType,
      body:              resolvedBody,
      template_name:     resolvedTemplateName,
      template_params:   messageType === "template" ? templateParams : null,
      status:            succeeded ? "sent" : "failed",
      status_updated_at: now,
      external_id:       succeeded ? (metaResult as MetaSuccess).wamid : null,
      error_code:        succeeded ? null : (metaResult as MetaFailure).errorCode,
      error_message:     succeeded ? null : (metaResult as MetaFailure).errorMessage,
      sent_by:           createdBy,
    })
    .select("id")
    .single();

  if (msgErr) {
    console.error("[wa-queue] failed to insert whatsapp_messages row:", msgErr.message);
    // Don't fail the queue item — the message state is ambiguous; mark failed
    // so the operator can inspect and retry manually.
    await markFailed(itemId, "DB_INSERT_ERROR", msgErr.message);
    return "processed";
  }

  // ── 6. Update conversation.last_message_at ────────────────────────────────
  await supabase
    .from("whatsapp_conversations")
    .update({ last_message_at: now })
    .eq("id", conversationId)
    .eq("company_id", companyId);

  // ── 7. Mark queue item sent or failed ─────────────────────────────────────
  if (succeeded) {
    const { error: patchErr } = await supabase
      .from("whatsapp_queue")
      .update({
        status:            "sent",
        processed_at:      now,
        result_message_id: msgRow!["id"],
        error_code:        null,
        error_message:     null,
      })
      .eq("id", itemId);

    if (patchErr) {
      console.error("[wa-queue] failed to mark item %s as sent:", itemId, patchErr.message);
    } else {
      console.info("[wa-queue] item %s sent (wamid: %s)", itemId, (metaResult as MetaSuccess).wamid);
    }
  } else {
    const failure = metaResult as MetaFailure;
    await markFailed(itemId, failure.errorCode, failure.errorMessage, msgRow?.["id"] as string | undefined);
  }

  return "processed";
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function markFailed(
  itemId:       string,
  errorCode:    string,
  errorMessage: string,
  resultMsgId?: string,
): Promise<void> {
  console.warn("[wa-queue] item %s failed: [%s] %s", itemId, errorCode, errorMessage);

  const { error } = await supabase
    .from("whatsapp_queue")
    .update({
      status:            "failed",
      processed_at:      new Date().toISOString(),
      error_code:        errorCode,
      error_message:     errorMessage,
      result_message_id: resultMsgId ?? null,
    })
    .eq("id", itemId);

  if (error) {
    console.error("[wa-queue] CRITICAL: could not mark item %s as failed:", itemId, error.message);
  }
}

// ── Interval management ────────────────────────────────────────────────────────

const TICK_MS             = 2_000;  // 2 seconds between ticks — 30 messages/min max
const MAX_BACKOFF_MS      = 60_000; // cap exponential back-off at 60 s
const CIRCUIT_OPEN_AFTER  = 10;     // trip circuit breaker after this many consecutive errors

let intervalHandle: ReturnType<typeof setInterval> | null = null;

// Guard: prevents a slow tick from overlapping with the next one.
let tickRunning = false;

// Back-off / circuit-breaker state
let consecutiveErrors = 0;
let backoffMs         = TICK_MS;
let backoffUntil      = 0;
let circuitOpen       = false;

async function tick(): Promise<void> {
  if (tickRunning)          return;
  if (circuitOpen)          return;
  if (Date.now() < backoffUntil) return; // still in back-off window

  tickRunning = true;
  try {
    const result = await processNextItem();

    if (result === "error") {
      consecutiveErrors++;

      if (consecutiveErrors >= CIRCUIT_OPEN_AFTER) {
        // Trip the circuit breaker — stop the loop, emit a single log line.
        circuitOpen = true;
        stopQueueProcessor();
        console.error(
          "[wa-queue] CIRCUIT OPEN — %d consecutive claim failures; processor halted. " +
          "Fix SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY and restart the server.",
          consecutiveErrors,
        );
        return;
      }

      // Exponential back-off (doubles each failure, capped at MAX_BACKOFF_MS)
      backoffMs    = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      backoffUntil = Date.now() + backoffMs;
      console.warn(
        "[wa-queue] back-off %dms after %d consecutive error(s)",
        backoffMs,
        consecutiveErrors,
      );
    } else {
      // "processed" or "empty" — reset error state
      if (consecutiveErrors > 0) {
        console.info("[wa-queue] recovered after %d error(s)", consecutiveErrors);
      }
      consecutiveErrors = 0;
      backoffMs         = TICK_MS;
      backoffUntil      = 0;
    }
  } finally {
    tickRunning = false;
  }
}

/**
 * Starts the queue processor background loop. Safe to call multiple times —
 * subsequent calls are no-ops if the processor is already running.
 *
 * Performs a startup credential check: if Supabase URL or service-role key
 * are absent, logs a single warning and returns without starting the interval,
 * preventing log flooding from guaranteed-to-fail network calls.
 */
export function startQueueProcessor(): void {
  if (intervalHandle !== null) return;

  // ── Startup credential check ───────────────────────────────────────────────
  const supabaseUrl = (
    process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? ""
  ).trim();
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() ?? "";

  if (!supabaseUrl || !serviceKey) {
    console.warn(
      "[wa-queue] SUPABASE_URL (or VITE_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY not set — " +
      "queue processor will NOT start. Set these secrets and restart the server.",
    );
    return;
  }

  // Reset circuit-breaker state in case startQueueProcessor is called after
  // a previous run tripped the breaker (e.g. in tests).
  consecutiveErrors = 0;
  backoffMs         = TICK_MS;
  backoffUntil      = 0;
  circuitOpen       = false;

  intervalHandle = setInterval(() => { void tick(); }, TICK_MS);
  // Run the first tick immediately so the queue isn't blocked for 2 s on startup
  void tick();
  console.info("[wa-queue] processor started (tick: %dms)", TICK_MS);
}

/**
 * Stops the processor. Primarily used in tests.
 */
export function stopQueueProcessor(): void {
  if (intervalHandle === null) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
  console.info("[wa-queue] processor stopped");
}
