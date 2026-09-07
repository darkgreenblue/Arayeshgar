import type { Client } from "@libsql/client";

/**
 * Serialises writes issued by this process.
 *
 * libsql's local binding is synchronous: waiting for SQLite's write lock blocks the
 * Node event loop rather than yielding. So if one transaction holds the lock and a
 * second write starts, the second one freezes the loop — and the first can never reach
 * its own `commit()`, because that commit is a callback on the loop it just froze. The
 * two only come unstuck when busy_timeout expires, which turns eight concurrent
 * bookings into eight five-second stalls and then failures.
 *
 * Queueing writes removes the in-process half of that contention entirely: a write
 * waits its turn on a promise, which yields, instead of on a lock, which does not.
 * Cross-process contention (the site against the bots) is left to busy_timeout, where
 * it belongs — there are two processes, and their transactions last milliseconds.
 *
 * Reads are not queued. Under WAL a reader never takes the write lock, so it neither
 * blocks nor gets blocked, and making it wait would only add latency.
 */

/** SELECT/PRAGMA/EXPLAIN never take the write lock. Anything else is assumed to. */
const READ_ONLY = /^\s*(?:select|pragma|explain)\b/i;

function isRead(stmtOrSql: unknown): boolean {
  const sql =
    typeof stmtOrSql === "string"
      ? stmtOrSql
      : typeof stmtOrSql === "object" && stmtOrSql !== null && "sql" in stmtOrSql
        ? String((stmtOrSql as { sql: unknown }).sql)
        : "";
  return READ_ONLY.test(sql);
}

/** Methods that must hold the queue for the whole call. */
const QUEUED = new Set(["execute", "batch", "executeMultiple", "migrate"]);
/** Methods that end a transaction and hand the queue back. */
const SETTLES = new Set(["commit", "rollback", "close"]);

export function serializeWrites(client: Client): Client {
  let tail: Promise<unknown> = Promise.resolve();

  /** Runs fn once every earlier queued call has settled, successfully or not. */
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn, fn);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Takes the queue and returns the release, for a transaction that settles later. */
  function acquire(): Promise<() => void> {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const turn = tail.then(
      () => undefined,
      () => undefined,
    );
    tail = turn.then(() => held);
    return turn.then(() => release);
  }

  function wrapTransaction(tx: object, release: () => void): object {
    let released = false;
    const settle = () => {
      if (!released) {
        released = true;
        release();
      }
    };
    return new Proxy(tx, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        // Bound to the target: these methods read private fields, which a proxy
        // receiver cannot see.
        if (typeof value !== "function") return value;
        const bound = (value as (...a: unknown[]) => unknown).bind(target);
        if (typeof prop !== "string" || !SETTLES.has(prop)) return bound;
        return (...args: unknown[]) => {
          try {
            const out = bound(...args);
            if (out instanceof Promise) return out.finally(settle);
            settle();
            return out;
          } catch (err) {
            settle();
            throw err;
          }
        };
      },
    });
  }

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string" || typeof value !== "function") return value;
      const bound = (value as (...a: unknown[]) => Promise<unknown>).bind(target);

      if (prop === "transaction") {
        return async (...args: unknown[]) => {
          const release = await acquire();
          try {
            const tx = (await bound(...args)) as object;
            return wrapTransaction(tx, release);
          } catch (err) {
            release();
            throw err;
          }
        };
      }
      if (!QUEUED.has(prop)) return bound;
      return (...args: unknown[]) => {
        if (prop === "execute" && isRead(args[0])) return bound(...args);
        return enqueue(() => bound(...args));
      };
    },
  }) as Client;
}
