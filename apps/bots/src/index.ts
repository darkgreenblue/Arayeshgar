/**
 * Bots service entrypoint (phase 0 skeleton).
 *  - HTTP server (Hono): /health, /hooks/:platform/:tenantId/:secret  (phase 4)
 *  - Worker loop: expire unpaid bookings, drain notification outbox, enqueue reminders (phase 1)
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getEnv, logger, startWorker, type Senders } from "@arayeshgar/core";
import { createDb } from "@arayeshgar/db";
import { sql } from "drizzle-orm";

process.env.SERVICE_NAME = "bots";
const env = getEnv();
const db = createDb(env.DATABASE_URL);
const app = new Hono();

app.get("/health", async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ ok: true, service: "bots", db: "up" });
  } catch (err) {
    logger.error({ err }, "health check: db down");
    return c.json({ ok: false, service: "bots", db: "down" }, 503);
  }
});

app.all("/hooks/:platform/:tenantId/:secret", (c) => {
  // Phase 4 wires grammY webhookCallback per tenant here.
  return c.json({ ok: false, error: "bots not wired yet (phase 4)" }, 501);
});

serve({ fetch: app.fetch, port: env.BOTS_PORT }, (info) => {
  logger.info({ port: info.port }, "bots http listening");
});

// Worker: expire unpaid bookings, enqueue reminders, drain the notification outbox.
// Channel senders (Telegram/Bale) are registered in phase 4; until then rows wait in the outbox.
const senders: Senders = {};
const stopWorker = startWorker(db, senders, env.WORKER_INTERVAL_SEC);
logger.info({ intervalSec: env.WORKER_INTERVAL_SEC }, "worker started");

const shutdown = (signal: string) => {
  logger.info({ signal }, "shutting down");
  stopWorker();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
