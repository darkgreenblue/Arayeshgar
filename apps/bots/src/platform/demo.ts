/**
 * The shared demo bot: one Telegram token and one Bale token that serve every tenant
 * whose status is still `demo`.
 *
 * A sold customer gets their own bot, and the token alone says which tenant an update
 * belongs to. Prospects cannot: making a BotFather bot for each one would put a manual
 * step in front of every sales call, which is the opposite of "a new demo takes minutes".
 * So one bot serves them all and the tenant is resolved per update instead of per token:
 *
 *   1. `/start t_<slug>` — the deep link on the demo page. Binds this chat to that tenant.
 *   2. otherwise, whatever this chat was bound to last.
 *   3. nothing — the chat opened the bot without a link, and is told to use one.
 *
 * The binding lives in bot_bindings, not in the conversation state, so it survives the
 * end of a booking flow.
 */
import { Bot } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { and, eq, isNull } from "drizzle-orm";
import { botBindings, tenants, type Db, type Platform, type Tenant } from "@arayeshgar/db";
import { getEnv, logger, withRetry } from "@arayeshgar/core";
import { apiRootFor, CAPABILITIES } from "./capabilities";
import type { BotCtx } from "./bot";

/** `/start t_<slug>` — the payload Telegram and Bale put after the command. */
const START_PAYLOAD = /^\/start(?:@\S+)?\s+t_([a-z0-9-]{1,64})\s*$/i;

export function demoTokenFor(platform: Platform): string | null {
  const env = getEnv();
  const token = platform === "telegram" ? env.DEMO_TELEGRAM_BOT_TOKEN : env.DEMO_BALE_BOT_TOKEN;
  return token && token.length > 0 ? token : null;
}

export function slugFromStart(text: string | undefined): string | null {
  if (!text) return null;
  const m = START_PAYLOAD.exec(text);
  return m ? m[1]!.toLowerCase() : null;
}

async function bind(db: Db, platform: Platform, userId: string, tenantId: string): Promise<void> {
  await db
    .insert(botBindings)
    .values({ platform, platformUserId: userId, tenantId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [botBindings.platform, botBindings.platformUserId],
      set: { tenantId, updatedAt: new Date() },
    });
}

async function boundTenant(db: Db, platform: Platform, userId: string): Promise<Tenant | null> {
  const [row] = await db
    .select({ tenantId: botBindings.tenantId })
    .from(botBindings)
    .where(and(eq(botBindings.platform, platform), eq(botBindings.platformUserId, userId)));
  if (!row) return null;
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, row.tenantId) });
  return tenant ?? null;
}

/**
 * Resolves which demo tenant an update belongs to, binding the chat when the update
 * carries a deep link. Only `demo` tenants are reachable this way: a sold customer's
 * data must never be served by the shared bot, whatever slug someone types.
 */
export async function resolveDemoTenant(
  db: Db,
  platform: Platform,
  userId: string,
  messageText: string | undefined,
): Promise<Tenant | null> {
  const slug = slugFromStart(messageText);
  if (slug) {
    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
    if (tenant && tenant.status === "demo") {
      await bind(db, platform, userId, tenant.id);
      logger.info({ tenantId: tenant.id, platform, slug }, "demo chat bound");
      return tenant;
    }
    logger.warn({ platform, slug }, "demo deep link did not match a demo tenant");
    return null;
  }
  return boundTenant(db, platform, userId);
}

const shared = new Map<Platform, { bot: Bot<BotCtx>; token: string }>();

/**
 * Builds (or returns) the shared bot for a platform. Unlike getBot, the tenant is not
 * captured at build time — the middleware below looks it up for every update, so one
 * instance can answer for many tenants at once.
 */
export async function getSharedDemoBot(
  db: Db,
  platform: Platform,
  register: (bot: Bot<BotCtx>) => void,
): Promise<Bot<BotCtx> | null> {
  const token = demoTokenFor(platform);
  if (!token) return null;
  const hit = shared.get(platform);
  if (hit && hit.token === token) return hit.bot;

  // See the matching comment in platform/bot.ts: grammY defaults to a 500s timeout, and
  // withRetry below cannot shorten it because bot.init() never receives its AbortSignal.
  // This is the one bot every prospect's demo depends on, so a fast, visible failure here
  // matters even more than for a single tenant's own bot.
  const bot = new Bot<BotCtx>(token, {
    client: { apiRoot: apiRootFor(platform), timeoutSeconds: 15 },
  });
  // rethrowHttpErrors: true is load-bearing, not tuning -- see the long comment at the
  // matching line in platform/bot.ts. Without it, this exact call is the one that hung
  // forever in production: syncBots()'s checkpoint logs showed execution entering this
  // function and never coming back, not even after minutes, because autoRetry's inner
  // loop was silently swallowing our own 15s timeout and retrying it into the void.
  bot.api.config.use(
    autoRetry({ maxRetryAttempts: 2, maxDelaySeconds: 5, rethrowHttpErrors: true }),
  );
  bot.use(async (ctx, next) => {
    const userId = String(ctx.from?.id ?? "");
    if (!userId) return;
    const tenant = await resolveDemoTenant(db, platform, userId, ctx.message?.text);
    if (!tenant) {
      await ctx.reply(
        "برای شروع، لینکی که آرایشگر برایتان فرستاده را باز کنید تا بدانم از کدام آرایشگاه می‌خواهید نوبت بگیرید.",
      );
      return;
    }
    ctx.tenant = tenant;
    ctx.platform = platform;
    ctx.caps = CAPABILITIES[platform];
    await next();
  });
  register(bot);
  bot.catch((err) => {
    logger.error(
      { platform, shared: true, err: String(err.error), update: err.ctx.update?.update_id },
      "shared demo bot handler failed",
    );
  });
  await withRetry(() => bot.init(), { label: `${platform}.demo.init`, attempts: 2 });
  shared.set(platform, { bot, token });
  logger.info({ platform, username: bot.botInfo.username }, "shared demo bot initialized");
  return bot;
}

export function cachedSharedDemoBot(platform: Platform): Bot<BotCtx> | undefined {
  return shared.get(platform)?.bot;
}

/**
 * Records the shared bot's username on every demo tenant that has no bot of its own.
 *
 * The platform panel needs it to show the salesperson a deep link, and only this process
 * ever learns it (from getMe at init). Writing it into the column that already exists for
 * exactly this — the tenant's bot username — keeps the panel free of extra configuration,
 * and a sold tenant simply overwrites it with its own bot's name.
 */
export async function publishDemoBotUsername(
  db: Db,
  platform: Platform,
  username: string | undefined,
): Promise<void> {
  if (!username) return;
  const column = platform === "telegram" ? "telegramBotUsername" : "baleBotUsername";
  const tokenColumn = platform === "telegram" ? tenants.telegramBotToken : tenants.baleBotToken;
  await db
    .update(tenants)
    .set({ [column]: username })
    .where(and(eq(tenants.status, "demo"), isNull(tokenColumn)));
}

export function dropSharedDemoBot(platform: Platform): void {
  shared.delete(platform);
}

/** The deep link a demo page shows, e.g. https://t.me/arayeshgar_demo_bot?start=t_ali */
export function demoDeepLink(botUsername: string, platform: Platform, slug: string): string {
  const host = platform === "telegram" ? "https://t.me" : "https://ble.ir";
  return `${host}/${botUsername}?start=t_${slug}`;
}
