/**
 * WhatsApp backend routes
 *
 * POST /api/whatsapp/send
 *   Send a new outgoing message into an existing conversation.
 *
 * GET  /api/whatsapp/conversations
 *   List conversations for the caller's company (paginated).
 *
 * GET  /api/whatsapp/messages/:conversationId
 *   List messages within a conversation (paginated).
 *
 * POST /api/whatsapp/templates/sync
 *   Stub endpoint — Meta Cloud API integration not yet connected.
 *
 * Auth:   Bearer <supabase-access-token> required on all routes.
 * Tenant: All queries are scoped to the caller's company_id.
 */
import { Router } from "express";
import { z }      from "zod";
import { supabase }             from "../lib/supabase.js";
import { requireAuth, MANAGER_ROLES } from "../lib/auth.js";

const router = Router();

// ── Shared constants ──────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MESSAGE_TYPES = [
  "text", "image", "document", "audio",
  "video", "template", "location", "sticker",
] as const;

const CONVERSATION_STATUSES = ["active", "archived", "blocked"] as const;

/** Format Zod validation errors into a single readable string. */
function zodError(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
    .join("; ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta WhatsApp Cloud API — text message delivery
// ─────────────────────────────────────────────────────────────────────────────

const META_API_VERSION = "v20.0";
const META_API_BASE    = "https://graph.facebook.com";

type MetaSuccess = { wamid: string };
type MetaFailure = { errorCode: string; errorMessage: string };
type MetaResult  = MetaSuccess | MetaFailure;

function isMetaSuccess(r: MetaResult): r is MetaSuccess {
  return "wamid" in r;
}

/**
 * Sends a text message via the Meta WhatsApp Cloud API.
 *
 * Returns { wamid } on success or { errorCode, errorMessage } on failure.
 * Never throws — all errors are captured and returned as a MetaFailure.
 *
 * @param to           Recipient phone number in E.164 format (e.g. +919876543210)
 * @param body         Plain-text message body (max 4096 chars)
 * @param accessToken  WHATSAPP_ACCESS_TOKEN env var value
 * @param phoneNumberId WHATSAPP_PHONE_NUMBER_ID env var value
 */
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
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type:    "individual",
        to,
        type:              "text",
        text:              { preview_url: false, body },
      }),
    });
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    return { errorCode: "NETWORK_ERROR", errorMessage: msg };
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await httpRes.json()) as Record<string, unknown>;
  } catch {
    return {
      errorCode:    "PARSE_ERROR",
      errorMessage: `Meta API returned HTTP ${httpRes.status} with a non-JSON body`,
    };
  }

  // ── Success path ──────────────────────────────────────────────────────────
  // Meta returns: { messages: [{ id: "wamid.xxx" }], ... }
  if (httpRes.ok) {
    const messages = payload["messages"];
    const wamid =
      Array.isArray(messages) && messages.length > 0
        ? (messages[0] as Record<string, unknown>)["id"]
        : undefined;

    if (typeof wamid === "string" && wamid) {
      return { wamid };
    }
    // Unexpected success body shape
    return {
      errorCode:    "UNEXPECTED_RESPONSE",
      errorMessage: `Meta API HTTP ${httpRes.status} but no wamid in response`,
    };
  }

  // ── Error path ────────────────────────────────────────────────────────────
  // Meta returns: { error: { code: number, message: string, ... } }
  const errObj = payload["error"] as Record<string, unknown> | undefined;
  return {
    errorCode:    String(errObj?.["code"]    ?? httpRes.status),
    errorMessage: String(errObj?.["message"] ?? `HTTP ${httpRes.status}`),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Storage — media upload helpers
// ─────────────────────────────────────────────────────────────────────────────

const MEDIA_BUCKET = "whatsapp-media";
let   _bucketReady = false;

/** Creates the whatsapp-media bucket on first use (idempotent). */
async function ensureMediaBucket(): Promise<void> {
  if (_bucketReady) return;

  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.warn("[whatsapp/storage] Could not list buckets:", listErr.message);
    return;
  }

  if (buckets?.find((b) => b.name === MEDIA_BUCKET)) {
    _bucketReady = true;
    return;
  }

  const { error: createErr } = await supabase.storage.createBucket(MEDIA_BUCKET, {
    public:           true, // public URLs so Meta can fetch the media bytes
    fileSizeLimit:    52_428_800, // 50 MB
    allowedMimeTypes: [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "audio/mpeg", "audio/ogg", "audio/wav", "audio/aac", "audio/mp4",
      "video/mp4", "video/3gpp", "video/quicktime",
    ],
  });

  if (createErr && !createErr.message.includes("already exists")) {
    console.error("[whatsapp/storage] Failed to create bucket:", createErr.message);
    return;
  }

  _bucketReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta WhatsApp Cloud API — media message delivery
// ─────────────────────────────────────────────────────────────────────────────

type MetaMediaType = "image" | "document" | "audio" | "video";

/**
 * Sends a media message (image / document / audio / video) via Meta Cloud API.
 * The media must be publicly accessible at `mediaUrl` — Supabase public-bucket
 * URLs satisfy this requirement.
 */
async function sendMediaViaMetaApi(
  to:            string,
  mediaType:     MetaMediaType,
  mediaUrl:      string,
  caption:       string,              // used for image / document / video; ignored for audio
  filename:      string | undefined,  // document only
  accessToken:   string,
  phoneNumberId: string,
): Promise<MetaResult> {
  const url = `${META_API_BASE}/${META_API_VERSION}/${phoneNumberId}/messages`;

  const mediaObj: Record<string, unknown> = { link: mediaUrl };
  if (mediaType !== "audio" && caption)   mediaObj["caption"]  = caption;
  if (mediaType === "document" && filename) mediaObj["filename"] = filename;

  let httpRes: Response;
  try {
    httpRes = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type:    "individual",
        to,
        type:              mediaType,
        [mediaType]:       mediaObj,
      }),
    });
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    return { errorCode: "NETWORK_ERROR", errorMessage: msg };
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await httpRes.json()) as Record<string, unknown>;
  } catch {
    return {
      errorCode:    "PARSE_ERROR",
      errorMessage: `Meta API returned HTTP ${httpRes.status} with a non-JSON body`,
    };
  }

  if (httpRes.ok) {
    const messages = payload["messages"];
    const wamid    =
      Array.isArray(messages) && messages.length > 0
        ? (messages[0] as Record<string, unknown>)["id"]
        : undefined;

    if (typeof wamid === "string" && wamid) return { wamid };
    return {
      errorCode:    "UNEXPECTED_RESPONSE",
      errorMessage: `Meta API HTTP ${httpRes.status} but no wamid in response`,
    };
  }

  const errObj = payload["error"] as Record<string, unknown> | undefined;
  return {
    errorCode:    String(errObj?.["code"]    ?? httpRes.status),
    errorMessage: String(errObj?.["message"] ?? `HTTP ${httpRes.status}`),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/whatsapp/upload-url
//
// Issues a Supabase Storage signed upload URL so the browser can PUT the media
// file directly to Supabase (with XHR progress tracking) without routing the
// bytes through this server. After a successful upload the browser calls /send
// with the resulting publicUrl.
// ─────────────────────────────────────────────────────────────────────────────

const UploadUrlSchema = z.object({
  conversationId: z.string().regex(UUID_RE, "must be a valid UUID"),
  filename:       z.string().min(1).max(255),
  mimeType:       z.string().min(1).max(127),
});

router.post("/whatsapp/upload-url", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { companyId } = auth;

  const parsed = UploadUrlSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: zodError(parsed.error) });
    return;
  }
  const { conversationId, filename, mimeType } = parsed.data;

  // Verify the conversation belongs to this company
  const { data: conv, error: convErr } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .single();

  if (convErr || !conv) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }

  await ensureMediaBucket();

  // Collision-resistant path: company / conversation / timestamp-filename
  const safeName    = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  const storagePath = `${companyId}/${conversationId}/${Date.now()}-${safeName}`;

  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (uploadErr || !uploadData) {
    console.error("[whatsapp/upload-url] createSignedUploadUrl failed:", uploadErr?.message);
    res.status(500).json({ error: "Failed to create upload URL." });
    return;
  }

  const { data: { publicUrl } } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  res.status(200).json({
    signedUrl: uploadData.signedUrl,
    path:      storagePath,
    publicUrl,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/whatsapp/send
// ─────────────────────────────────────────────────────────────────────────────

const SendMessageSchema = z.object({
  /** UUID of the target conversation */
  conversationId: z.string().regex(UUID_RE, "must be a valid UUID"),

  /** Plain-text body. Required for text messages; optional for media/template. */
  body: z.string().max(4096).default(""),

  messageType: z.enum(MESSAGE_TYPES).default("text"),

  // ── Media fields (populated when messageType is image / document / audio / video) ──
  mediaUrl:       z.string().url().optional(),
  mediaMimeType:  z.string().max(127).optional(),
  mediaFilename:  z.string().max(255).optional(),

  // ── Template fields (populated when messageType = 'template') ──────────────
  templateName:   z.string().max(512).optional(),
  /** Variable substitutions as an ordered array or a key→value map */
  templateParams: z.record(z.string(), z.unknown()).optional(),
}).refine(
  (d) => {
    if (d.messageType === "text" && !d.body.trim()) return false;
    if (d.messageType === "template" && !d.templateName) return false;
    return true;
  },
  {
    message:
      "body is required for text messages; templateName is required for template messages",
  },
);

router.post("/whatsapp/send", async (req, res) => {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { callerId, companyId } = auth;

  // ── Validate body ──────────────────────────────────────────────────────────
  const parsed = SendMessageSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: zodError(parsed.error) });
    return;
  }
  const {
    conversationId,
    body,
    messageType,
    mediaUrl,
    mediaMimeType,
    mediaFilename,
    templateName,
    templateParams,
  } = parsed.data;

  // ── Verify conversation exists and belongs to this company ─────────────────
  const { data: conv, error: convErr } = await supabase
    .from("whatsapp_conversations")
    .select("id, company_id, status, contact_phone")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .single();

  if (convErr || !conv) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  if (conv.status === "blocked") {
    res.status(422).json({ error: "Cannot send messages to a blocked conversation." });
    return;
  }

  // ── Insert message ─────────────────────────────────────────────────────────
  const now = new Date().toISOString();

  const { data: message, error: insertErr } = await supabase
    .from("whatsapp_messages")
    .insert({
      conversation_id:   conversationId,
      company_id:        companyId,
      direction:         "outgoing",
      message_type:      messageType,
      body,
      media_url:         mediaUrl         ?? null,
      media_mime_type:   mediaMimeType    ?? null,
      media_filename:    mediaFilename    ?? null,
      template_name:     templateName     ?? null,
      template_params:   templateParams   ?? null,
      status:            "pending",
      status_updated_at: now,
      sent_by:           callerId,
    })
    .select()
    .single();

  if (insertErr || !message) {
    console.error("[whatsapp/send] insert message failed:", insertErr?.message);
    res.status(500).json({ error: "Failed to store message." });
    return;
  }

  // ── Update conversation.last_message_at ────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("whatsapp_conversations")
    .update({ last_message_at: now })
    .eq("id", conversationId)
    .eq("company_id", companyId);   // redundant tenant guard

  if (updateErr) {
    // Non-fatal — the message is persisted; log and continue.
    console.error("[whatsapp/send] failed to update last_message_at:", updateErr.message);
  }

  // ── Meta Cloud API delivery ────────────────────────────────────────────────
  // Dispatches text, image, document, audio, and video messages to the
  // recipient via the Meta WhatsApp Cloud API when both required env vars are
  // present. On any outcome the message row is patched so the DB always
  // reflects the real delivery state rather than staying on "pending".

  const accessToken    = process.env["WHATSAPP_ACCESS_TOKEN"]?.trim()    ?? "";
  const phoneNumberId  = process.env["WHATSAPP_PHONE_NUMBER_ID"]?.trim() ?? "";
  const metaConfigured = !!(accessToken && phoneNumberId);

  const MEDIA_TYPES = new Set(["image", "document", "audio", "video"]);

  // Dispatch when: meta is configured AND (text message OR media message with a URL)
  const shouldDispatch =
    metaConfigured &&
    (messageType === "text" || (MEDIA_TYPES.has(messageType) && !!mediaUrl));

  let finalMessage = message;

  if (shouldDispatch) {
    const contactPhone = conv.contact_phone as string;

    const metaResult =
      messageType === "text"
        ? await sendTextViaMetaApi(contactPhone, body, accessToken, phoneNumberId)
        : await sendMediaViaMetaApi(
            contactPhone,
            messageType as MetaMediaType,
            mediaUrl!,       // guarded by shouldDispatch condition
            body,            // caption for image / document / video
            mediaFilename,
            accessToken,
            phoneNumberId,
          );

    const statusTs = new Date().toISOString();

    if (isMetaSuccess(metaResult)) {
      // ── Delivery succeeded ──────────────────────────────────────────────
      const { data: updated, error: patchErr } = await supabase
        .from("whatsapp_messages")
        .update({
          external_id:       metaResult.wamid,
          status:            "sent",
          status_updated_at: statusTs,
          error_code:        null,
          error_message:     null,
        })
        .eq("id", message.id)
        .eq("company_id", companyId)
        .select()
        .single();

      if (patchErr) {
        console.error("[whatsapp/send] failed to patch message after Meta success:", patchErr.message);
      } else {
        finalMessage = updated;
      }
    } else {
      // ── Delivery failed ─────────────────────────────────────────────────
      console.error("[whatsapp/send] Meta API error:", metaResult.errorCode, metaResult.errorMessage);

      const { data: updated, error: patchErr } = await supabase
        .from("whatsapp_messages")
        .update({
          status:            "failed",
          status_updated_at: statusTs,
          error_code:        metaResult.errorCode,
          error_message:     metaResult.errorMessage,
        })
        .eq("id", message.id)
        .eq("company_id", companyId)
        .select()
        .single();

      if (patchErr) {
        console.error("[whatsapp/send] failed to patch message after Meta failure:", patchErr.message);
      } else {
        finalMessage = updated;
      }
    }
  } else if (!metaConfigured) {
    console.warn(
      "[whatsapp/send] WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set — " +
      "message stored as pending but not dispatched to Meta.",
    );
  }

  res.status(201).json({ success: true, message: finalMessage });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/whatsapp/conversations
// ─────────────────────────────────────────────────────────────────────────────

const ConversationsQuerySchema = z.object({
  /** Filter by conversation status */
  status: z.enum(CONVERSATION_STATUSES).optional(),
  /** Maximum rows to return (1–100) */
  limit:  z.coerce.number().int().min(1).max(100).default(50),
  /** Zero-based row offset for pagination */
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/whatsapp/conversations", async (req, res) => {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { companyId } = auth;

  // ── Validate query params ──────────────────────────────────────────────────
  const parsed = ConversationsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: zodError(parsed.error) });
    return;
  }
  const { status, limit, offset } = parsed.data;

  // ── Query conversations ────────────────────────────────────────────────────
  let query = supabase
    .from("whatsapp_conversations")
    .select(
      `id,
       lead_id,
       contact_name,
       contact_phone,
       status,
       last_message_at,
       created_by,
       created_at,
       updated_at`,
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  const { data: conversations, error, count } = await query;

  if (error) {
    console.error("[whatsapp/conversations] query failed:", error.message);
    res.status(500).json({ error: "Failed to fetch conversations." });
    return;
  }

  res.status(200).json({
    conversations: conversations ?? [],
    total:  count  ?? 0,
    limit,
    offset,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/whatsapp/messages/:conversationId
// ─────────────────────────────────────────────────────────────────────────────

const MessagesQuerySchema = z.object({
  /** Maximum rows to return (1–100) */
  limit:     z.coerce.number().int().min(1).max(100).default(50),
  /** Zero-based row offset for pagination */
  offset:    z.coerce.number().int().min(0).default(0),
  /** Filter to a single direction */
  direction: z.enum(["incoming", "outgoing"]).optional(),
});

router.get("/whatsapp/messages/:conversationId", async (req, res) => {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { companyId } = auth;

  // ── Validate path param ────────────────────────────────────────────────────
  const { conversationId } = req.params;
  if (!conversationId || !UUID_RE.test(conversationId)) {
    res.status(400).json({ error: "conversationId must be a valid UUID." });
    return;
  }

  // ── Validate query params ──────────────────────────────────────────────────
  const parsed = MessagesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: zodError(parsed.error) });
    return;
  }
  const { limit, offset, direction } = parsed.data;

  // ── Verify the conversation exists and belongs to this company ─────────────
  const { data: conv, error: convErr } = await supabase
    .from("whatsapp_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .single();

  if (convErr || !conv) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }

  // ── Query messages ─────────────────────────────────────────────────────────
  let query = supabase
    .from("whatsapp_messages")
    .select(
      `id,
       conversation_id,
       direction,
       message_type,
       body,
       media_url,
       media_mime_type,
       media_filename,
       template_name,
       template_params,
       status,
       status_updated_at,
       error_code,
       error_message,
       external_id,
       sent_by,
       created_at,
       updated_at`,
      { count: "exact" },
    )
    .eq("conversation_id", conversationId)
    .eq("company_id", companyId)       // redundant tenant guard
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (direction) {
    query = query.eq("direction", direction);
  }

  const { data: messages, error, count } = await query;

  if (error) {
    console.error("[whatsapp/messages] query failed:", error.message);
    res.status(500).json({ error: "Failed to fetch messages." });
    return;
  }

  res.status(200).json({
    messages: messages ?? [],
    total:  count  ?? 0,
    limit,
    offset,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/whatsapp/templates/sync
// ─────────────────────────────────────────────────────────────────────────────
//
// Stub endpoint — the Meta Cloud API integration has not yet been connected.
// When implemented this will:
//   1. Call GET /<WABA_ID>/message_templates on the Graph API.
//   2. Upsert results into whatsapp_templates (status, external_id, rejection_reason).
//   3. Return a count of added / updated / removed templates.

router.post("/whatsapp/templates/sync", async (req, res) => {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const auth = await requireAuth(req, res);
  if (!auth) return;

  // ── Role check: managers and above only ────────────────────────────────────
  if (!MANAGER_ROLES.has(auth.role)) {
    res.status(403).json({ error: "Only managers and above can sync templates." });
    return;
  }

  // ── Stub response ──────────────────────────────────────────────────────────
  res.status(200).json({
    success:   false,
    synced:    false,
    message:
      "Template sync is not yet available. Connect the Meta WhatsApp Cloud API " +
      "(WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID) to enable this endpoint.",
    hint: "POST /api/whatsapp/templates/sync will upsert approved templates from Meta once configured.",
  });
});

export default router;
