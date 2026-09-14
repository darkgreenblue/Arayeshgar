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
import { curlFetch } from "./curl-fetch";

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

  // `timeoutSeconds` is load-bearing, not tuning: grammY defaults to 500s (its own doc
  // calls this out as the thing that "may effectively make your bot freeze" on a network
  // stall), and `withRetry` below cannot shorten that itself -- `bot.init()` takes no
  // AbortSignal, so the timer `withRetry` sets never actually touches the pending request.
  // Measured on the real server: one tenant's bot.init() hung for the full ~1000s of two
  // back-to-back 500s grammY timeouts before syncBots() ever logged anything, during a
  // multi-minute stall on this VPS's outbound network (the same window the cloudflared
  // tunnel logged "no recent network activity" and reconnected). A short timeout here
  // turns that into a fast, visible retry instead of a silent multi-tenant freeze.
  //
  // `fetch: curlFetch` is not a style choice. On the real server, Node's own network stack
  // (fetch, https.request, with or without the exact keepAlive agent grammY builds) failed
  // every single getMe() attempt for hours, while a `curl` *subprocess* to the exact same
  // URL from inside the exact same process at the exact same moment succeeded every time.
  // See curl-fetch.ts for the full account. This routes grammY's own network calls through
  // that subprocess instead of Node's HTTP client.
  const bot = new Bot<BotCtx>(token, {
    client: {
      apiRoot: apiRootFor(platform),
      timeoutSeconds: 15,
      fetch: curlFetch as unknown as typeof fetch,
    },
  });
  // The real bug, found by bisecting with checkpoint logs after three timeout/DNS fixes
  // changed nothing: `autoRetry`'s own `maxRetryAttempts` only bounds its *outer* loop,
  // which reacts to a successful-but-rate-limited response (retry_after) or a 5xx status.
  // A thrown HttpError -- exactly what our 15s client timeout above produces -- is caught
  // by a *separate*, uncapped inner loop that retries forever with exponential backoff
  // (3s, 6s, 12s, ... capped at one hour, but never capped in attempt count) unless
  // `rethrowHttpErrors: true` is set. Without it, one timeout during bot.init() means the
  // promise this awaits never resolves or rejects -- not in 15s, not in an hour -- so
  // `withRetry`'s own 2-attempt limit below never even gets a chance to run out. Rethrowing
  // here hands the error back to `withRetry`, which has its own bounded, logged retry.
  bot.api.config.use(
    autoRetry({ maxRetryAttempts: 2, maxDelaySeconds: 5, rethrowHttpErrors: true }),
  );
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
  //
  // The `(signal) => bot.init(signal)` here is not decoration -- it is the actual fix.
  // grammY's own `Bot.init()` wraps the getMe call in its OWN internal retry helper
  // (bot.js's `withRetries`, unrelated to the `@grammyjs/auto-retry` plugin above), and
  // that helper has no attempt limit of its own at all -- it retries forever on any
  // HttpError, with backoff only capped at 20 minutes *between* attempts, not in count.
  // The only way grammY lets you bound it is the AbortSignal parameter on `init()`.
  // Every previous fix here (env check, client timeoutSeconds, DNS ipv4first, then
  // rethrowHttpErrors on the plugin above) addressed a real problem one layer up, but
  // none of them could touch this: `bot.init()` with no argument means grammY's own
  // retry loop runs with signal === undefined, so it never has a reason to stop. Passing
  // withRetry's own controller.signal through means that once withRetry's timeout fires,
  // grammY's retry loop sees an aborted signal, rejects immediately instead of sleeping
  // for its next backoff, and withRetry's own bounded, logged retry finally gets to run.
  //
  // grammY's Node build types this parameter against the `abort-controller` npm polyfill,
  // not the native global AbortSignal our own withRetry creates -- structurally identical
  // at runtime (both implement the same aborted/addEventListener/removeEventListener
  // surface grammY actually calls), but TypeScript treats them as distinct classes. The
  // cast below is exactly that mismatch, nothing more.
  await withRetry((signal) => bot.init(signal as Parameters<typeof bot.init>[0]), {
    label: `${platform}.init`,
    attempts: 2,
  });
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
