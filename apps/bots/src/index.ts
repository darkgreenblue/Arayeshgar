/**
 * Bots service: webhook HTTP server + notification/expiry worker in one process.
 *  - POST /hooks/:platform/:tenantId/:secret  → grammY update handling for that tenant
 *  - worker loop: expire unpaid bookings, enqueue reminders, drain the notification outbox
 *  - on boot (and every 10 minutes) it makes sure every active tenant's webhook is registered
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getEnv, logger, startWorker } from "@arayeshgar/core";
import { createDb, type Tenant } from "@arayeshgar/db";
import { activeTenants } from "@arayeshgar/core";
import { createRouter } from "./router";
import { createSenders } from "./senders";
import { getBot } from "./platform/bot";
import { registerAll } from "./register";
import { ensureWebhook } from "./platform/webhook";

process.env.SERVICE_NAME = "bots";
const env = getEnv();
const db = createDb(env.DATABASE_URL);

const app = new Hono();
app.get("/health", async (c) => {
  try {
    await db.get(sql`select 1`);
    return c.json({ ok: true, service: "bots", db: "up" });
  } catch (err) {
    logger.error({ err: String(err) }, "health check: db down");
    return c.json({ ok: false, service: "bots", db: "down" }, 503);
  }
});
app.route("/", createRouter(db));

/** Registers webhooks for every tenant that has tokens; failures are logged, never fatal. */
export async function syncWebhooks(): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  const list = (await activeTenants(db)) as Tenant[];
  for (const tenant of list) {
    for (const platform of ["telegram", "bale"] as const) {
      const featureOn =
        platform === "telegram" ? tenant.features.telegram_bot : tenant.features.bale_bot;
      const token = platform === "telegram" ? tenant.telegramBotToken : tenant.baleBotToken;
      if (!featureOn || !token) continue;
      try {
        const bot = await getBot(tenant, platform, (b) => registerAll(b, db));
        if (!bot) continue;
        await ensureWebhook(bot, tenant, platform);
        ok++;
      } catch (err) {
        failed++;
        logger.error({ tenantId: tenant.id, platform, err: String(err) }, "webhook sync failed");
      }
    }
  }
  if (ok || failed) logger.info({ ok, failed }, "webhook sync finished");
  return { ok, failed };
}

serve({ fetch: app.fetch, port: env.BOTS_PORT }, (info) => {
  logger.info({ port: info.port, publicUrl: env.BOTS_PUBLIC_URL }, "bots http listening");
});

const stopWorker = startWorker(db, createSenders(db), env.WORKER_INTERVAL_SEC);
logger.info({ intervalSec: env.WORKER_INTERVAL_SEC }, "worker started");

void syncWebhooks();
const webhookTimer = setInterval(() => void syncWebhooks(), 10 * 60_000);

const shutdown = (signal: string) => {
  logger.info({ signal }, "shutting down");
  stopWorker();
  clearInterval(webhookTimer);
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
