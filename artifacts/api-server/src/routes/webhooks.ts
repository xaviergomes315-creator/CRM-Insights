import { Router } from "express";
import type { Response } from "express";

const router = Router();

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

// ─── GET /api/webhooks/leads/stream  (SSE) ───────────────────────────────────

router.get("/leads/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Initial ping so the client knows it's connected
  res.write(`event: connected\ndata: {"status":"ok","clients":${sseClients.size + 1}}\n\n`);

  sseClients.add(res);

  // Heartbeat every 25 s to keep the connection alive through proxies
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

const VALID_SOURCES = [
  "WhatsApp",
  "Website",
  "IndiaMart",
  "JustDial",
  "Social Media",
] as const;

router.post("/leads", (req, res) => {
  const { name, phone, source, email } = req.body ?? {};

  // Basic validation
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Missing required field: name" });
    return;
  }
  if (!phone || typeof phone !== "string" || !phone.trim()) {
    res.status(400).json({ error: "Missing required field: phone" });
    return;
  }
  if (!source || !VALID_SOURCES.includes(source)) {
    res
      .status(400)
      .json({ error: `Invalid source. Must be one of: ${VALID_SOURCES.join(", ")}` });
    return;
  }

  const lead = {
    name:        name.trim(),
    phone:       phone.trim(),
    source:      source as (typeof VALID_SOURCES)[number],
    email:       typeof email === "string" ? email.trim() : "",
    receivedAt:  Date.now(),
  };

  broadcast("new_lead", lead);

  res.status(201).json({
    success: true,
    lead,
    clientsNotified: sseClients.size,
    message: `Lead "${lead.name}" pushed to ${sseClients.size} connected dashboard(s).`,
  });
});

// ─── GET /api/webhooks/leads  (health / docs) ────────────────────────────────

router.get("/leads", (_req, res) => {
  res.json({
    endpoint:       "POST /api/webhooks/leads",
    description:    "Push an inbound lead from IndiaMart, Facebook Leads, or any form.",
    connectedDashboards: sseClients.size,
    requiredFields: { name: "string", phone: "string", source: `one of: ${VALID_SOURCES.join(", ")}` },
    optionalFields: { email: "string" },
    example: {
      name:   "Priya Sharma",
      phone:  "+91 98765 43210",
      source: "IndiaMart",
      email:  "priya@example.com",
    },
  });
});

export default router;
