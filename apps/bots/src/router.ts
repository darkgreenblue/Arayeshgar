/**
 * Multi-tenant webhook router. One HTTP server fronts every tenant's Telegram and Bale bots:
 *   POST /hooks/:platform/:tenantId/:secret
 * The URL secret is the authentication (Bale may not send Telegram's secret header).
 */
import { Hono } from "hono";
import { webhookCallback } from "grammy";
import { eq } from "drizzle-orm";
import { tenants, type Db, type Platform } from "@arayeshgar/db";
import { logger } from "@arayeshgar/core";
import { getBot } from "./platform/bot";
import { registerAll } from "./register";

const isPlatform = (v: string): v is Platform => v === "telegram" || v === "bale";

/** Timing-safe-ish comparison for short secrets. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function createRouter(db: Db) {
  const app = new Hono();

  app.post("/hooks/:platform/:tenantId/:secret", async (c) => {
    const { platform, tenantId, secret } = c.req.param();
    if (!isPlatform(platform)) return c.json({ ok: false }, 404);
    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
    if (!tenant || !secretsMatch(tenant.webhookSecret, secret)) {
      logger.warn({ tenantId, platform }, "webhook rejected: unknown tenant or bad secret");
      return c.json({ ok: false }, 403);
    }
    if (tenant.status === "suspended") return c.json({ ok: true, skipped: "suspended" });
    const featureOn =
      platform === "telegram" ? tenant.features.telegram_bot : tenant.features.bale_bot;
    if (!featureOn) return c.json({ ok: true, skipped: "channel disabled" });

    const bot = await getBot(tenant, platform, (b) => registerAll(b, db));
    if (!bot) return c.json({ ok: false, error: "no token" }, 503);
    // grammY's Hono adapter answers the platform immediately and processes the update.
    return webhookCallback(bot, "hono")(c);
  });

  return app;
}
