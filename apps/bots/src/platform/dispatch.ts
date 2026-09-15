/**
 * Per-user update delivery for long polling.
 *
 * Telegram may send many updates in one polling batch. A global await means one slow photo
 * download blocks every customer; fully parallel delivery creates races when the same person
 * taps twice or uploads a receipt while cancelling. This wrapper mirrors the proven Tarot-bot
 * pattern: independent users run concurrently, each user's updates remain serial.
 */
import type { Bot } from "grammy";
import type { BotCtx } from "./bot";

type QueueEntry = { tail: Promise<void>; depth: number };
export type DispatchStats = {
  inflight: number;
  peak: number;
  queued: number;
  done: number;
  backpressure: number;
  readonly queues: number;
};

const installed = new WeakMap<object, DispatchStats>();

function actorKey(update: Record<string, unknown>): string {
  for (const key of ["message", "callback_query", "edited_message", "my_chat_member"]) {
    const value = update[key];
    if (!value || typeof value !== "object") continue;
    const item = value as { from?: { id?: number }; chat?: { id?: number } };
    if (item.from?.id != null) return `u${item.from.id}`;
    if (item.chat?.id != null) return `c${item.chat.id}`;
  }
  // Unknown system updates are uncommon; one conservative queue is safer than concurrent
  // processing of an update whose owner cannot be determined.
  return "system";
}

/** Installs once per bot and returns live counters for logs/tests. */
export function installSerialDispatch(bot: Bot<BotCtx>, maxInflight = 128): DispatchStats {
  const previous = installed.get(bot);
  if (previous) return previous;

  const queues = new Map<string, QueueEntry>();
  const stats: DispatchStats = {
    inflight: 0,
    peak: 0,
    queued: 0,
    done: 0,
    backpressure: 0,
    get queues() {
      return queues.size;
    },
  };
  const original = bot.handleUpdate.bind(bot);

  bot.handleUpdate = function dispatch(update, webhookResponse) {
    // In webhook mode the HTTP response owns this promise, so preserve grammY's contract.
    if (webhookResponse) return original(update, webhookResponse);
    if (stats.inflight >= maxInflight) {
      stats.backpressure++;
      return original(update);
    }

    const key = actorKey(update as unknown as Record<string, unknown>);
    const entry = queues.get(key) ?? { tail: Promise.resolve(), depth: 0 };
    entry.depth++;
    stats.inflight++;
    stats.queued++;
    stats.peak = Math.max(stats.peak, stats.inflight);
    entry.tail = entry.tail
      .then(() => original(update))
      // grammY routes ordinary handler failures to bot.catch. This guard is only a last
      // defence so a rejected update can never poison this user's queue forever.
      .catch(() => undefined)
      .then(() => {
        entry.depth--;
        stats.inflight--;
        stats.done++;
        if (entry.depth === 0 && queues.get(key) === entry) queues.delete(key);
      });
    queues.set(key, entry);
    return Promise.resolve();
  };
  installed.set(bot, stats);
  return stats;
}
