import { logger } from "../logger";

export type RetryOptions = {
  attempts?: number; // total tries (default 3)
  baseDelayMs?: number; // first backoff (default 500)
  maxDelayMs?: number; // cap (default 8000)
  timeoutMs?: number; // per-attempt timeout (default 15000)
  label?: string;
  shouldRetry?: (err: unknown) => boolean;
};

export class RetryExhaustedError extends Error {
  constructor(
    label: string,
    public readonly lastError: unknown,
  ) {
    super(`${label}: all retry attempts failed: ${String(lastError)}`);
    this.name = "RetryExhaustedError";
  }
}

/**
 * Wraps any external call (Telegram, Bale, AI) with per-attempt timeout + exponential backoff.
 * Usage: await withRetry(() => bot.api.sendMessage(...), { label: "telegram.sendMessage" })
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const cap = opts.maxDelayMs ?? 8000;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const label = opts.label ?? "external-call";
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    try {
      return await fn(controller.signal);
    } catch (err) {
      lastError = err;
      const retry = opts.shouldRetry ? opts.shouldRetry(err) : true;
      logger.warn({ label, attempt, attempts, err: String(err) }, "external call failed");
      if (!retry || attempt === attempts) break;
      const delay = Math.min(cap, base * 2 ** (attempt - 1)) + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new RetryExhaustedError(label, lastError);
}
