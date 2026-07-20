/**
 * WhatsApp Message Queue routes
 *
 * POST   /api/whatsapp/queue
 *   Enqueue a text or template message for delivery. The background
 *   processor sends it as soon as the queue reaches that item.
 *
 * GET    /api/whatsapp/queue
 *   List queue items for the caller's company, newest first.
 *   Optional query params: status, conversation_id, limit (max 100), offset.
 *
 * GET    /api/whatsapp/queue/:id
 *   Fetch a single queue item by ID.
 *
 * DELETE /api/whatsapp/queue/:id
 *   Cancel a pending item. Returns 409 if the item is already
 *   processing / sent / failed / cancelled.
 *
 * Auth: Bearer <supabase-access-token> required on every route.
 * All queries are scoped to the caller's company_id.
 */

import { Router } from "express";
import { z }      from "zod";
import { supabase }                        from "../lib/supabase.js";
import { requireAuth, MANAGER_ROLES }      from "../lib/auth.js";
import { startQueueProcessor }             from "../lib/whatsapp-queue-processor.js";

// ── Start the background processor when this module is first imported ─────────
startQueueProcessor();

const router = Router();

// ── Shared constants ───────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const QUEUE_STATUSES = ["pending", "processing", "sent", "failed", "cancelled"] as const;

function zodError(err: z.ZodError): string {
  return err.issues
    .map(i => `${i.path.join(".") || "body"}: ${i.message}`)
    .join("; ");
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/whatsapp/queue
//
// Enqueues one message for asynchronous delivery.
// ─────────────────────────────────────────────────────────────────────────────

const EnqueueSchema = z.object({
  conversationId: z.string().regex(UUID_RE, "must be a valid UUID"),

  messageType: z.enum(["text", "template"]).default("text"),

  // Required for messageType = 'text'
  body: z.string().max(4096).optional(),

  // Required for messageType = 'template'
  templateId:     z.string().uuid("must be a valid UUID").optional(),
  templateParams: z.array(z.string().max(1024)).default([]),

  // Optional: schedule delivery for a future time (ISO 8601 timestamp).
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});

router.post("/whatsapp/queue", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { callerId, companyId } = auth;

  const parsed = EnqueueSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: zodError(parsed.error) });
    return;
  }
  const { conversationId, messageType, body, templateId, templateParams, scheduledAt } = parsed.data;

  // ── Validate content for message type ─────────────────────────────────────
  if (messageType === "text") {
    if (!body?.trim()) {
      res.status(400).json({ error: "body is required and must be non-empty for text messages." });
      return;
    }
  }
  if (messageType === "template") {
    if (!templateId) {
      res.status(400).json({ error: "templateId is required for template messages." });
      return;
    }
  }

  // ── Verify conversation belongs to caller's company ────────────────────────
  const { data: conv, error: convErr } = await supabase
    .from("whatsapp_conversations")
    .select("id, status")
    .eq("id", conversationId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .single();

  if (convErr || !conv) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  if ((conv["status"] as string) === "blocked") {
    res.status(422).json({ error: "Cannot enqueue messages for a blocked conversation." });
    return;
  }

  // ── Verify template exists and is approved (early validation) ─────────────
  if (messageType === "template" && templateId) {
    const { data: tpl, error: tplErr } = await supabase
      .from("whatsapp_templates")
      .select("id, name, status, body_text")
      .eq("id", templateId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .single();

    if (tplErr || !tpl) {
      res.status(404).json({ error: "Template not found." });
      return;
    }
    if ((tpl["status"] as string) !== "approved") {
      res.status(422).json({
        error: `Template is not approved (status: ${tpl["status"]}). Only approved templates can be queued.`,
      });
      return;
    }
  }

  // ── Insert queue item ──────────────────────────────────────────────────────
  const { data: item, error: insertErr } = await supabase
    .from("whatsapp_queue")
    .insert({
      company_id:      companyId,
      created_by:      callerId,
      conversation_id: conversationId,
      message_type:    messageType,
      body:            body ?? "",
      template_id:     templateId ?? null,
      template_params: templateParams,
      scheduled_at:    scheduledAt ?? null,
      status:          "pending",
    })
    .select()
    .single();

  if (insertErr || !item) {
    console.error("[whatsapp/queue] insert failed:", insertErr?.message);
    res.status(500).json({ error: "Failed to enqueue message." });
    return;
  }

  res.status(201).json({ success: true, item });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/whatsapp/queue
//
// Lists queue items for the caller's company, newest first.
// ─────────────────────────────────────────────────────────────────────────────

const ListQueueSchema = z.object({
  status:          z.enum(QUEUE_STATUSES).optional(),
  conversation_id: z.string().regex(UUID_RE).optional(),
  limit:           z.coerce.number().int().min(1).max(100).default(50),
  offset:          z.coerce.number().int().min(0).default(0),
});

router.get("/whatsapp/queue", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { companyId } = auth;

  const parsed = ListQueueSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: zodError(parsed.error) });
    return;
  }
  const { status, conversation_id, limit, offset } = parsed.data;

  let query = supabase
    .from("whatsapp_queue")
    .select(`
      id, company_id, created_by, conversation_id,
      message_type, body, template_id, template_params,
      scheduled_at, status, attempt_count,
      processed_at, result_message_id,
      error_code, error_message,
      created_at, updated_at
    `, { count: "exact" })
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status)          query = query.eq("status",          status);
  if (conversation_id) query = query.eq("conversation_id", conversation_id);

  const { data: items, count, error } = await query;

  if (error) {
    console.error("[whatsapp/queue] list failed:", error.message);
    res.status(500).json({ error: "Failed to fetch queue." });
    return;
  }

  res.json({ items: items ?? [], total: count ?? 0, limit, offset });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/whatsapp/queue/:id
//
// Fetches a single queue item by ID.
// ─────────────────────────────────────────────────────────────────────────────

router.get("/whatsapp/queue/:id", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { companyId } = auth;

  const id = req.params["id"];
  if (!id || !UUID_RE.test(id)) {
    res.status(400).json({ error: "id: must be a valid UUID." });
    return;
  }

  const { data: item, error } = await supabase
    .from("whatsapp_queue")
    .select(`
      id, company_id, created_by, conversation_id,
      message_type, body, template_id, template_params,
      scheduled_at, status, attempt_count,
      processed_at, result_message_id,
      error_code, error_message,
      created_at, updated_at
    `)
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (error || !item) {
    res.status(404).json({ error: "Queue item not found." });
    return;
  }

  res.json({ item });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/whatsapp/queue/:id
//
// Cancels a pending queue item. Returns 409 if the item is no longer
// in 'pending' state (already claimed, sent, failed, or cancelled).
// Managers can cancel anyone's items; others can only cancel their own.
// ─────────────────────────────────────────────────────────────────────────────

router.delete("/whatsapp/queue/:id", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { callerId, companyId, role } = auth;

  const id = req.params["id"];
  if (!id || !UUID_RE.test(id)) {
    res.status(400).json({ error: "id: must be a valid UUID." });
    return;
  }

  // ── Fetch the item first to check ownership and current status ─────────────
  const { data: item, error: fetchErr } = await supabase
    .from("whatsapp_queue")
    .select("id, status, created_by")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (fetchErr || !item) {
    res.status(404).json({ error: "Queue item not found." });
    return;
  }

  // ── Ownership check ────────────────────────────────────────────────────────
  const isManager = MANAGER_ROLES.has(role);
  if (!isManager && (item["created_by"] as string) !== callerId) {
    res.status(403).json({ error: "You can only cancel your own queue items." });
    return;
  }

  // ── State check ────────────────────────────────────────────────────────────
  if ((item["status"] as string) !== "pending") {
    res.status(409).json({
      error:  `Cannot cancel a queue item with status "${item["status"]}". Only pending items can be cancelled.`,
      status: item["status"],
    });
    return;
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  // Use a conditional update to guard against a race where the processor
  // claims the item between our SELECT and this UPDATE.
  const { data: cancelled, error: updateErr } = await supabase
    .from("whatsapp_queue")
    .update({ status: "cancelled", processed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("status", "pending")   // atomic guard
    .select()
    .single();

  if (updateErr || !cancelled) {
    // Most likely the processor claimed it a millisecond ago
    res.status(409).json({
      error: "Item could not be cancelled — it may have just been picked up for processing.",
    });
    return;
  }

  res.json({ success: true, item: cancelled });
});

export default router;
