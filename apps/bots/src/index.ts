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
import { pollerKey, startPolling, stopAllPolling, stopPollersNotIn } from "./platform/polling";
import { demoTokenFor, getSharedDemoBot, publishDemoBotUsername } from "./platform/demo";

process.env.SERVICE_NAME = "bots";
/** Stands in for a tenant id in the poller registry: the demo bots belong to no one tenant. */
const DEMO_POLLER_ID = "shared-demo";
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

/**
 * Brings every tenant's bots online in whichever transport is configured, and takes
 * offline any poller whose tenant lost its token or was suspended. Failures are logged
 * per tenant, never fatal: one bad token must not silence everyone else's bots.
 */
export async function syncBots(): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  const live = new Set<string>();
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
        if (env.BOT_TRANSPORT === "polling") {
          await startPolling(tenant.id, platform, bot, token);
          live.add(pollerKey(tenant.id, platform));
        } else {
          await ensureWebhook(bot, tenant, platform);
        }
        ok++;
      } catch (err) {
        failed++;
        logger.error({ tenantId: tenant.id, platform, err: String(err) }, "bot sync failed");
      }
    }
  }
  // The shared demo bots are keyed by platform, not by tenant: one instance answers for
  // every prospect, so it is started once rather than once per demo tenant.
  for (const platform of ["telegram", "bale"] as const) {
    if (!demoTokenFor(platform)) continue;
    try {
      const bot = await getSharedDemoBot(db, platform, (b) => registerAll(b, db));
      if (!bot) continue;
      await publishDemoBotUsername(db, platform, bot.botInfo.username);
      if (env.BOT_TRANSPORT === "polling") {
        await startPolling(DEMO_POLLER_ID, platform, bot, demoTokenFor(platform)!);
        live.add(pollerKey(DEMO_POLLER_ID, platform));
      }
      ok++;
    } catch (err) {
      failed++;
      logger.error({ platform, err: String(err) }, "shared demo bot sync failed");
    }
  }

  if (env.BOT_TRANSPORT === "polling") await stopPollersNotIn(live);
  if (ok || failed) logger.info({ transport: env.BOT_TRANSPORT, ok, failed }, "bot sync finished");
  return { ok, failed };
}

serve({ fetch: app.fetch, port: env.BOTS_PORT }, (info) => {
  logger.info({ port: info.port, publicUrl: env.BOTS_PUBLIC_URL }, "bots http listening");
});

const stopWorker = startWorker(db, createSenders(db), env.WORKER_INTERVAL_SEC);
logger.info({ intervalSec: env.WORKER_INTERVAL_SEC }, "worker started");

void syncBots();
const botSyncTimer = setInterval(() => void syncBots(), 10 * 60_000);

const shutdown = (signal: string) => {
  logger.info({ signal }, "shutting down");
  stopWorker();
  clearInterval(botSyncTimer);
  // Let pollers finish their in-flight getUpdates so no update is handled twice.
  void stopAllPolling().finally(() => process.exit(0));
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
