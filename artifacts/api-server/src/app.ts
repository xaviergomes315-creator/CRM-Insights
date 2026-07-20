import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// ── CORS ─────────────────────────────────────────────────────────────────────
// Lock to explicit origins in production. Set CORS_ORIGIN to a comma-separated
// list of allowed origins (e.g. "https://app.example.com,https://www.example.com").
// In development with no CORS_ORIGIN set, fall back to same-origin only (false).
const allowedOrigins = process.env["CORS_ORIGIN"]
  ? process.env["CORS_ORIGIN"].split(",").map((o) => o.trim()).filter(Boolean)
  : null;

app.use(
  cors({
    origin: allowedOrigins ?? (process.env["NODE_ENV"] === "development" ? true : false),
    credentials: true,
  }),
);

// ── Body parsing ─────────────────────────────────────────────────────────────
// 10 MB cap: a large PDF base64-encodes to ~7–8 MB; this blocks memory-exhaustion
// DoS attacks from oversized payloads while still accommodating real proposals.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

export default app;
