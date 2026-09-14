/**
 * Bots service: webhook HTTP server + notification/expiry worker in one process.
 *  - POST /hooks/:platform/:tenantId/:secret  → grammY update handling for that tenant
 *  - worker loop: expire unpaid bookings, enqueue reminders, drain the notification outbox
 *  - on boot (and every 10 minutes) it makes sure every active tenant's webhook is registered
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { ensurePlatformAdmins, getEnv, logger, parseAdminIds, startWorker } from "@arayeshgar/core";
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
/**
 * Loopback only, and not negotiable.
 *
 * `serve()` passes this straight to `server.listen(port, hostname)`. Leave it out and the
 * hostname is `undefined`, which makes Node bind every interface — so on the shared server
 * this health endpoint would have been answering the open internet. The hard rule is that
 * nothing here opens a public port; the Cloudflare tunnel is the only way in, and it reaches
 * loopback from inside the box. Webhook transport goes through that same tunnel.
 */
export const BIND_HOST = "127.0.0.1";
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
    if (!demoTokenFor(platform)) {
      // Silent here once meant nobody could tell "no demo bot configured for this
      // platform" from "the token failed to reach this process" — both looked like
      // nothing happening at all. Reza Hosseini's demo bot link went dead for this
      // exact reason and there was no log to point at.
      logger.warn({ platform }, "no demo token for this platform — shared demo bot not started");
      continue;
    }
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
  // Always, not just when ok||failed — "0 and 0" is itself the finding when it happens on
  // a server that is supposed to be running a demo bot, and the guarded version above hid
  // exactly that case for as long as this file has existed.
  logger.info({ transport: env.BOT_TRANSPORT, ok, failed }, "bot sync finished");
  return { ok, failed };
}

serve({ fetch: app.fetch, port: env.BOTS_PORT, hostname: BIND_HOST }, (info) => {
  logger.info(
    { host: BIND_HOST, port: info.port, publicUrl: env.BOTS_PUBLIC_URL },
    "bots http listening",
  );
});

const stopWorker = startWorker(db, createSenders(db), env.WORKER_INTERVAL_SEC);
logger.info({ intervalSec: env.WORKER_INTERVAL_SEC }, "worker started");

// Before anything else: restore the platform admins named in ADMIN_IDS. This is the
// guarantee that a wrong `Ops → admin-remove` costs a restart rather than the account.
void ensurePlatformAdmins(db, parseAdminIds(env.ADMIN_IDS));

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
