/**
 * One grammY instance per (tenant, platform), created lazily and cached. Telegram and Bale share
 * the same code; only `apiRoot` differs. Bots are cheap to build but `init()` costs a getMe call,
 * so the cache is keyed and invalidated when a tenant's token changes.
 */
import { Bot, type Context } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import type { Platform, Tenant } from "@arayeshgar/db";
import { logger, withRetry } from "@arayeshgar/core";
import { apiRootFor, CAPABILITIES, type Capabilities } from "./capabilities";

export type BotCtx = Context & {
  tenant: Tenant;
  platform: Platform;
  caps: Capabilities;
};

export type ManagedBot = { bot: Bot<BotCtx>; token: string };

const cache = new Map<string, ManagedBot>();
const key = (tenantId: string, platform: Platform) => `${tenantId}:${platform}`;

export function tokenFor(tenant: Tenant, platform: Platform): string | null {
  return platform === "telegram" ? tenant.telegramBotToken : tenant.baleBotToken;
}

/** Builds (or returns) the bot for a tenant/platform. `register` wires handlers on first build. */
export async function getBot(
  tenant: Tenant,
  platform: Platform,
  register: (bot: Bot<BotCtx>) => void,
): Promise<Bot<BotCtx> | null> {
  const token = tokenFor(tenant, platform);
  if (!token) return null;
  const k = key(tenant.id, platform);
  const hit = cache.get(k);
  if (hit && hit.token === token) return hit.bot;

  const bot = new Bot<BotCtx>(token, { client: { apiRoot: apiRootFor(platform) } });
  bot.api.config.use(autoRetry({ maxRetryAttempts: 2, maxDelaySeconds: 5 }));
  bot.use(async (ctx, next) => {
    ctx.tenant = tenant;
    ctx.platform = platform;
    ctx.caps = CAPABILITIES[platform];
    await next();
  });
  register(bot);
  bot.catch((err) => {
    logger.error(
      { tenantId: tenant.id, platform, err: String(err.error), update: err.ctx.update?.update_id },
      "bot handler failed",
    );
  });
  // init() fetches getMe; required before handling updates.
  await withRetry(() => bot.init(), { label: `${platform}.init`, attempts: 2 });
  cache.set(k, { bot, token });
  logger.info({ tenantId: tenant.id, platform, username: bot.botInfo.username }, "bot initialized");
  return bot;
}

export function dropBot(tenantId: string, platform: Platform) {
  cache.delete(key(tenantId, platform));
}
export function cachedBot(tenantId: string, platform: Platform): Bot<BotCtx> | undefined {
  return cache.get(key(tenantId, platform))?.bot;
}

/** answerCallbackQuery is best-effort: old Bale clients reject it and that must not break a flow. */
export async function safeAnswerCallback(ctx: BotCtx, text?: string): Promise<void> {
  if (!ctx.callbackQuery || !ctx.caps.answerCallbackQuery) return;
  try {
    await ctx.answerCallbackQuery(text ? { text } : undefined);
  } catch (err) {
    logger.debug(
      { platform: ctx.platform, err: String(err) },
      "answerCallbackQuery unsupported; ignoring",
    );
  }
}

/**
 * Edit the current message when possible, otherwise send a new one. Bale sometimes refuses edits;
 * falling back keeps the conversation moving instead of dead-ending.
 */
export async function replyOrEdit(ctx: BotCtx, text: string, keyboard?: unknown): Promise<void> {
  const markup = keyboard ? { reply_markup: keyboard as never } : {};
  if (ctx.callbackQuery?.message && ctx.caps.editMessage) {
    try {
      await ctx.editMessageText(text, markup);
      return;
    } catch (err) {
      logger.debug(
        { platform: ctx.platform, err: String(err) },
        "editMessageText failed; sending new message",
      );
    }
  }
  await ctx.reply(text, markup);
}
