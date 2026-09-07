/**
 * Long-polling transport.
 *
 * Webhooks need a public HTTPS URL, which means a domain and a tunnel before anyone can
 * see a bot work. Polling needs neither: the process reaches out to Telegram and Bale,
 * so a salesperson can run the whole demo from a laptop. §11 of PLATFORM.md makes this
 * the default for that reason; BOT_TRANSPORT=webhook switches back once a stable public
 * URL exists and the extra latency of polling starts to matter.
 *
 * One poller per (tenant, platform). The set is reconciled on the same schedule the
 * webhook sync used, so a tenant that gains or loses a token is picked up within minutes
 * without a restart.
 */
import type { Bot } from "grammy";
import type { Platform } from "@arayeshgar/db";
import { logger } from "@arayeshgar/core";
import type { BotCtx } from "./bot";

const running = new Map<string, { bot: Bot<BotCtx>; token: string }>();
const key = (tenantId: string, platform: Platform) => `${tenantId}:${platform}`;

/**
 * Starts polling for one bot, unless the same token is already being polled.
 *
 * Telegram refuses getUpdates while a webhook is registered, and a tenant may have been
 * running in webhook mode a moment ago, so the webhook is cleared first. Pending updates
 * are dropped with it: they were queued for an endpoint that is no longer listening, and
 * replaying a stale booking tap would confuse the customer more than losing it.
 */
export async function startPolling(
  tenantId: string,
  platform: Platform,
  bot: Bot<BotCtx>,
  token: string,
): Promise<void> {
  const k = key(tenantId, platform);
  const current = running.get(k);
  if (current) {
    if (current.token === token) return;
    await stopPolling(tenantId, platform);
  }

  await bot.api.deleteWebhook({ drop_pending_updates: true }).catch((err: unknown) => {
    logger.debug({ tenantId, platform, err: String(err) }, "deleteWebhook before polling failed");
  });

  running.set(k, { bot, token });
  // start() only settles when the bot stops, so it is deliberately not awaited.
  void bot
    .start({
      allowed_updates: ["message", "callback_query"],
      onStart: (info) => logger.info({ tenantId, platform, username: info.username }, "polling"),
    })
    .catch((err: unknown) => {
      running.delete(k);
      logger.error({ tenantId, platform, err: String(err) }, "polling stopped with an error");
    });
}

export async function stopPolling(tenantId: string, platform: Platform): Promise<void> {
  const k = key(tenantId, platform);
  const entry = running.get(k);
  if (!entry) return;
  running.delete(k);
  try {
    await entry.bot.stop();
    logger.info({ tenantId, platform }, "polling stopped");
  } catch (err) {
    logger.warn({ tenantId, platform, err: String(err) }, "stopping poller failed");
  }
}

/** Stops every poller whose (tenant, platform) is not in `keep`. */
export async function stopPollersNotIn(keep: Set<string>): Promise<void> {
  for (const k of [...running.keys()]) {
    if (keep.has(k)) continue;
    const [tenantId, platform] = k.split(":") as [string, Platform];
    await stopPolling(tenantId, platform);
  }
}

export function pollerKey(tenantId: string, platform: Platform): string {
  return key(tenantId, platform);
}

export function pollingCount(): number {
  return running.size;
}

export async function stopAllPolling(): Promise<void> {
  await stopPollersNotIn(new Set());
}
