import { Router } from "express";
import type { Response } from "express";
import { supabase, type LeadRow } from "../lib/supabase.js";

const router = Router();

// ─── Telecaller pool (must match frontend MOCK_USERS) ─────────────────────────

const TELECALLER_POOL = [
  { id: "2", name: "Ravi Kumar"  },
  { id: "3", name: "Sunita Rao"  },
];

const VALID_SOURCES = [
  "WhatsApp",
  "Website",
  "IndiaMart",
  "JustDial",
  "Social Media",
] as const;

type ValidSource = (typeof VALID_SOURCES)[number];

// ─── SSE client registry ──────────────────────────────────────────────────────

const sseClients = new Set<Response>();

function broadcast(event: string, payload: unknown) {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(chunk);
    } catch {
      sseClients.delete(res);
    }
  }
}

// ─── Round-robin assignment ───────────────────────────────────────────────────
// Query the DB for the current lead count so assignment is stateless across
// server restarts.

async function nextAssignedTo(): Promise<string> {
  if (TELECALLER_POOL.length === 0) return "";
  const { count, error } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true });
  const idx = error || count === null ? 0 : count % TELECALLER_POOL.length;
  return TELECALLER_POOL[idx].id;
}

// ─── GET /api/webhooks/leads/stream  (SSE) ───────────────────────────────────

router.get("/leads/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(
    `event: connected\ndata: {"status":"ok","clients":${sseClients.size + 1}}\n\n`,
  );

  sseClients.add(res);

  const hb = setInterval(() => {
    try {
      res.write(":heartbeat\n\n");
    } catch {
      clearInterval(hb);
      sseClients.delete(res);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(hb);
    sseClients.delete(res);
  });
});

// ─── POST /api/webhooks/leads  (inbound webhook) ─────────────────────────────

router.post("/leads", async (req, res) => {
  const { name, phone, source, email } = req.body ?? {};

  // Validate required fields
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Missing required field: name" });
    return;
  }
  if (!phone || typeof phone !== "string" || !phone.trim()) {
    res.status(400).json({ error: "Missing required field: phone" });
    return;
  }
  if (!source || !VALID_SOURCES.includes(source as ValidSource)) {
    res.status(400).json({
      error: `Invalid source. Must be one of: ${VALID_SOURCES.join(", ")}`,
    });
    return;
  }

  const ts          = Date.now();
  const assignedTo  = await nextAssignedTo();

  const row: Omit<LeadRow, "id"> = {
    name:             name.trim(),
    email:            typeof email === "string" ? email.trim() : "",
    phone:            phone.trim(),
    status:           "New",
    source:           source as ValidSource,
    assigned_to:      assignedTo,
    added_at:         ts,
    last_activity_at: ts,
  };

  // Persist to Supabase
  const { data: inserted, error } = await supabase
    .from("leads")
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error("[webhooks] Supabase insert error", error);
    res.status(500).json({
      error:   "Database error — lead was not saved.",
      details: error.message,
    });
    return;
  }

  // Broadcast the full DB row (with id) so the frontend can merge without
  // a second fetch.
  broadcast("new_lead", inserted);

  res.status(201).json({
    success:          true,
    lead:             inserted,
    clientsNotified:  sseClients.size,
    message: `Lead "${(inserted as LeadRow).name}" saved to Supabase and pushed to ${sseClients.size} dashboard(s).`,
  });
});

// ─── GET /api/webhooks/leads  (health / docs) ────────────────────────────────

router.get("/leads", (_req, res) => {
  res.json({
    endpoint:            "POST /api/webhooks/leads",
    description:         "Push an inbound lead from IndiaMart, Facebook Leads, or any form. Leads are saved to Supabase and broadcast via SSE.",
    connectedDashboards: sseClients.size,
    requiredFields:      { name: "string", phone: "string", source: `one of: ${VALID_SOURCES.join(", ")}` },
    optionalFields:      { email: "string" },
    example: {
      name:   "Priya Sharma",
      phone:  "+91 98765 43210",
      source: "IndiaMart",
      email:  "priya@example.com",
    },
  });
});

export default router;
