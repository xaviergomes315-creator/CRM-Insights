/**
 * WhatsApp Campaigns routes
 *
 * A campaign groups multiple whatsapp_queue items so you can send
 * the same message to many conversations and track progress in one place.
 *
 * POST   /api/whatsapp/campaigns
 *   Create a new campaign (status: draft). Supply the message content and
 *   the list of conversation UUIDs to target.
 *
 * GET    /api/whatsapp/campaigns
 *   List campaigns for the caller's company, newest first.
 *   Optional query params: status, limit (max 100), offset.
 *
 * GET    /api/whatsapp/campaigns/:id
 *   Fetch a single campaign by ID.
 *
 * POST   /api/whatsapp/campaigns/:id/start
 *   Start a draft campaign: enqueues one whatsapp_queue item per
 *   conversation and sets status = 'running'. Returns 409 if the
 *   campaign is not in 'draft' state.
 *
 * DELETE /api/whatsapp/campaigns/:id
 *   Cancel a campaign. Sets the campaign status to 'cancelled' and
 *   cancels any pending queue items that belong to it.
 *   Returns 409 if the campaign is already completed or cancelled.
 *
 * Auth: Bearer <supabase-access-token> required on every route.
 * All queries are scoped to the caller's company_id.
 */

import { Router } from "express";
import { z }      from "zod";
import { supabase }                   from "../lib/supabase.js";
import { requireAuth, MANAGER_ROLES } from "../lib/auth.js";

const router = Router();

// ── Shared constants ───────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CAMPAIGN_STATUSES = ["draft", "running", "completed", "cancelled"] as const;

function zodError(err: z.ZodError): string {
  return err.issues
    .map(i => `${i.path.join(".") || "body"}: ${i.message}`)
    .join("; ");
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/whatsapp/campaigns
//
// Creates a campaign in 'draft' state. The message is not sent until
// POST /campaigns/:id/start is called.
// ─────────────────────────────────────────────────────────────────────────────

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(255),

  messageType: z.enum(["text", "template"]).default("text"),

  // Required for messageType = 'text'
  body: z.string().max(4096).optional(),

  // Required for messageType = 'template'
  templateId:     z.string().uuid("must be a valid UUID").optional(),
  templateParams: z.array(z.string().max(1024)).default([]),

  // One or more conversation UUIDs to send to
  conversationIds: z
    .array(z.string().regex(UUID_RE, "each entry must be a valid UUID"))
    .min(1, "at least one conversationId is required")
    .max(1000, "cannot target more than 1000 conversations per campaign"),

  // Optional: schedule delivery for a future time (ISO 8601 timestamp)
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});

router.post("/whatsapp/campaigns", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { callerId, companyId } = auth;

  const parsed = CreateCampaignSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: zodError(parsed.error) });
    return;
  }
  const {
    name,
    messageType,
    body,
    templateId,
    templateParams,
    conversationIds,
    scheduledAt,
  } = parsed.data;

  // ── Validate content for message type ─────────────────────────────────────
  if (messageType === "text" && !body?.trim()) {
    res.status(400).json({ error: "body is required and must be non-empty for text messages." });
    return;
  }
  if (messageType === "template" && !templateId) {
    res.status(400).json({ error: "templateId is required for template messages." });
    return;
  }

  // ── Verify template is approved (early) ───────────────────────────────────
  if (messageType === "template" && templateId) {
    const { data: tpl, error: tplErr } = await supabase
      .from("whatsapp_templates")
      .select("id, status")
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
        error: `Template is not approved (status: ${tpl["status"]}). Only approved templates can be used in a campaign.`,
      });
      return;
    }
  }

  // ── Verify all conversations belong to this company ───────────────────────
  const { data: convRows, error: convErr } = await supabase
    .from("whatsapp_conversations")
    .select("id, status")
    .in("id", conversationIds)
    .eq("company_id", companyId)
    .is("deleted_at", null);

  if (convErr) {
    console.error("[wa-campaigns] conversation lookup failed:", convErr.message);
    res.status(500).json({ error: "Failed to verify conversations." });
    return;
  }

  const foundIds = new Set((convRows ?? []).map((r) => r["id"] as string));
  const missing  = conversationIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    res.status(404).json({
      error:   `${missing.length} conversation(s) not found or not accessible.`,
      missing,
    });
    return;
  }

  const blocked = (convRows ?? []).filter((r) => (r["status"] as string) === "blocked");
  if (blocked.length > 0) {
    res.status(422).json({
      error:   `${blocked.length} conversation(s) are blocked and cannot receive messages.`,
      blocked: blocked.map((r) => r["id"]),
    });
    return;
  }

  // ── Insert campaign (draft) ────────────────────────────────────────────────
  const { data: campaign, error: insertErr } = await supabase
    .from("whatsapp_campaigns")
    .insert({
      company_id:       companyId,
      created_by:       callerId,
      name,
      message_type:     messageType,
      body:             body ?? "",
      template_id:      templateId ?? null,
      template_params:  templateParams,
      conversation_ids: conversationIds,
      scheduled_at:     scheduledAt ?? null,
      total_count:      conversationIds.length,
      status:           "draft",
    })
    .select()
    .single();

  if (insertErr || !campaign) {
    console.error("[wa-campaigns] insert failed:", insertErr?.message);
    res.status(500).json({ error: "Failed to create campaign." });
    return;
  }

  res.status(201).json({ success: true, campaign });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/whatsapp/campaigns
//
// Lists campaigns for the caller's company, newest first.
// ─────────────────────────────────────────────────────────────────────────────

const ListCampaignsSchema = z.object({
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  limit:  z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/whatsapp/campaigns", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { companyId } = auth;

  const parsed = ListCampaignsSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: zodError(parsed.error) });
    return;
  }
  const { status, limit, offset } = parsed.data;

  let query = supabase
    .from("whatsapp_campaigns")
    .select(
      `id, company_id, created_by, name,
       message_type, body, template_id, template_params,
       scheduled_at, status,
       total_count, sent_count, failed_count, cancelled_count,
       started_at, completed_at,
       created_at, updated_at`,
      { count: "exact" },
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);

  const { data: items, count, error } = await query;

  if (error) {
    console.error("[wa-campaigns] list failed:", error.message);
    res.status(500).json({ error: "Failed to fetch campaigns." });
    return;
  }

  res.json({ items: items ?? [], total: count ?? 0, limit, offset });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/whatsapp/campaigns/:id
//
// Fetches a single campaign by ID (includes conversation_ids).
// ─────────────────────────────────────────────────────────────────────────────

router.get("/whatsapp/campaigns/:id", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { companyId } = auth;

  const id = req.params["id"];
  if (!id || !UUID_RE.test(id)) {
    res.status(400).json({ error: "id: must be a valid UUID." });
    return;
  }

  const { data: campaign, error } = await supabase
    .from("whatsapp_campaigns")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .single();

  if (error || !campaign) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }

  res.json({ campaign });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/whatsapp/campaigns/:id/start
//
// Starts a draft campaign by enqueuing one whatsapp_queue item per
// conversation. Sets campaign status = 'running'.
// Returns 409 if the campaign is not in 'draft' state.
// ─────────────────────────────────────────────────────────────────────────────

router.post("/whatsapp/campaigns/:id/start", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { callerId, companyId } = auth;

  const id = req.params["id"];
  if (!id || !UUID_RE.test(id)) {
    res.status(400).json({ error: "id: must be a valid UUID." });
    return;
  }

  // ── Fetch campaign ─────────────────────────────────────────────────────────
  const { data: campaign, error: fetchErr } = await supabase
    .from("whatsapp_campaigns")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !campaign) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }

  if ((campaign["status"] as string) !== "draft") {
    res.status(409).json({
      error:  `Cannot start a campaign with status "${campaign["status"]}". Only draft campaigns can be started.`,
      status: campaign["status"],
    });
    return;
  }

  const conversationIds  = (campaign["conversation_ids"]  as string[]) ?? [];
  const messageType      = campaign["message_type"]       as "text" | "template";
  const body             = campaign["body"]               as string;
  const templateId       = campaign["template_id"]        as string | null;
  const templateParams   = (campaign["template_params"]   as string[]) ?? [];
  const scheduledAt      = campaign["scheduled_at"]       as string | null;

  if (conversationIds.length === 0) {
    res.status(422).json({ error: "Campaign has no target conversations." });
    return;
  }

  // ── Enqueue one item per conversation ─────────────────────────────────────
  const queueItems = conversationIds.map((conversationId) => ({
    company_id:      companyId,
    created_by:      callerId,
    conversation_id: conversationId,
    campaign_id:     id,
    message_type:    messageType,
    body:            body ?? "",
    template_id:     templateId ?? null,
    template_params: templateParams,
    scheduled_at:    scheduledAt ?? null,
    status:          "pending",
  }));

  const { error: enqueueErr } = await supabase
    .from("whatsapp_queue")
    .insert(queueItems);

  if (enqueueErr) {
    console.error("[wa-campaigns] enqueue failed:", enqueueErr.message);
    res.status(500).json({ error: "Failed to enqueue campaign messages." });
    return;
  }

  // ── Mark campaign as running ───────────────────────────────────────────────
  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from("whatsapp_campaigns")
    .update({ status: "running", started_at: now })
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("status", "draft")   // atomic guard
    .select()
    .single();

  if (updateErr || !updated) {
    // Extremely unlikely race — items are enqueued but campaign status didn't flip.
    // Log it; the trigger will eventually mark it completed when the queue drains.
    console.error("[wa-campaigns] failed to set campaign running:", updateErr?.message);
    res.status(500).json({ error: "Messages enqueued but failed to update campaign status." });
    return;
  }

  res.json({ success: true, campaign: updated, queued: queueItems.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/whatsapp/campaigns/:id
//
// Cancels a campaign. Bulk-cancels any pending queue items that
// belong to it, then marks the campaign as 'cancelled'.
// Returns 409 if the campaign is already completed or cancelled.
// Managers can cancel anyone's campaign; others only their own.
// ─────────────────────────────────────────────────────────────────────────────

router.delete("/whatsapp/campaigns/:id", async (req, res) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const { callerId, companyId, role } = auth;

  const id = req.params["id"];
  if (!id || !UUID_RE.test(id)) {
    res.status(400).json({ error: "id: must be a valid UUID." });
    return;
  }

  // ── Fetch campaign ─────────────────────────────────────────────────────────
  const { data: campaign, error: fetchErr } = await supabase
    .from("whatsapp_campaigns")
    .select("id, status, created_by")
    .eq("id", id)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !campaign) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }

  // ── Ownership check ────────────────────────────────────────────────────────
  const isManager = MANAGER_ROLES.has(role);
  if (!isManager && (campaign["created_by"] as string) !== callerId) {
    res.status(403).json({ error: "You can only cancel your own campaigns." });
    return;
  }

  // ── State check ────────────────────────────────────────────────────────────
  const currentStatus = campaign["status"] as string;
  if (currentStatus === "completed" || currentStatus === "cancelled") {
    res.status(409).json({
      error:  `Cannot cancel a campaign with status "${currentStatus}".`,
      status: currentStatus,
    });
    return;
  }

  // ── Cancel all pending queue items for this campaign ──────────────────────
  const cancelledAt = new Date().toISOString();
  const { error: queueCancelErr } = await supabase
    .from("whatsapp_queue")
    .update({ status: "cancelled", processed_at: cancelledAt })
    .eq("campaign_id", id)
    .eq("company_id", companyId)
    .eq("status", "pending");   // only cancel what hasn't been claimed yet

  if (queueCancelErr) {
    console.error("[wa-campaigns] failed to cancel queue items:", queueCancelErr.message);
    res.status(500).json({ error: "Failed to cancel campaign queue items." });
    return;
  }

  // ── Mark campaign cancelled ────────────────────────────────────────────────
  const { data: cancelled, error: updateErr } = await supabase
    .from("whatsapp_campaigns")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("company_id", companyId)
    .select()
    .single();

  if (updateErr || !cancelled) {
    console.error("[wa-campaigns] failed to set campaign cancelled:", updateErr?.message);
    res.status(500).json({ error: "Queue items cancelled but failed to update campaign status." });
    return;
  }

  res.json({ success: true, campaign: cancelled });
});

export default router;
