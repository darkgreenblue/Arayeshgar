import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { serializeWrites } from "./write-queue";

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Where the database lives when nothing says otherwise (§9ب of PLATFORM.md: data/<proj>.db). */
export const DEFAULT_DB_PATH = "data/arayeshgar.db";

/** How long a writer waits for the one write lock before giving up. */
export const BUSY_TIMEOUT_MS = 5000;

/**
 * The directory a relative DATABASE_URL is measured from.
 *
 * A relative path resolved against the current directory means every process picks a
 * different file: `pnpm --filter @arayeshgar/db migrate` runs in packages/db, Playwright
 * runs in e2e/, and the two would migrate and read two separate databases that both look
 * correct. Anchoring to the workspace root makes one path mean one file everywhere.
 *
 * On the server there is no workspace file — the deployed bundle is the root, and pm2
 * starts both apps there — so the current directory is already the right anchor.
 */
function projectRoot(): string {
  let dir = process.cwd();
  for (let up = 0; up < 8; up++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Accepts what people actually type: a bare path, a `file:` URL, or a remote
 * libsql URL. Everything else is a mistake worth naming early — a leftover
 * `postgres://` in an .env would otherwise fail much later and much less clearly.
 */
export function resolveDbUrl(raw = process.env.DATABASE_URL ?? DEFAULT_DB_PATH): string {
  if (raw.startsWith("libsql://") || raw.startsWith("wss://") || raw.startsWith("https://")) {
    return raw;
  }
  if (raw.startsWith("postgres://") || raw.startsWith("postgresql://")) {
    throw new Error(
      "DATABASE_URL points at PostgreSQL, but this project stores data in SQLite. " +
        `Use a file path such as "${DEFAULT_DB_PATH}".`,
    );
  }
  const given = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
  if (given === ":memory:") return "file::memory:";
  const filePath = path.isAbsolute(given) ? given : path.resolve(projectRoot(), given);
  mkdirSync(path.dirname(filePath), { recursive: true });
  return `file:${filePath}`;
}

/**
 * Creates a Drizzle client over SQLite.
 * One instance per process; pass it explicitly (no globals) so tests can swap it.
 *
 * On concurrency, which is the whole reason this file has comments:
 *
 *   - The client keeps a small pool of connections, so a `PRAGMA` sent through it
 *     lands on whichever connection happened to be free and leaves the others with
 *     the defaults. Anything that must hold for every connection therefore has to be
 *     set at open time, which is what `timeout` (SQLite's busy_timeout) does here.
 *     Without it a second writer fails instantly instead of waiting its turn.
 *   - WAL lives in the database file itself, so `runMigrations` sets it once and every
 *     later process inherits it. Readers then never block the single writer.
 *   - The write lock is taken by BEGIN IMMEDIATE, which is what @libsql/client's
 *     transaction() issues by default. That is what makes the booking check-and-insert
 *     safe across the web and bot processes.
 *   - `PRAGMA foreign_keys` is per-connection and cannot be set at open time, so
 *     ON DELETE CASCADE must be assumed inactive: delete parents with `deleteTenant`.
 *   - The binding is synchronous, so a write that waits for the lock freezes the event
 *     loop and deadlocks against the very transaction it is waiting for. Writes from
 *     this process are therefore queued rather than left to race; see write-queue.ts.
 */
export function createDb(url?: string, opts: { busyTimeoutMs?: number } = {}) {
  const client = createClient({
    url: resolveDbUrl(url),
    timeout: opts.busyTimeoutMs ?? BUSY_TIMEOUT_MS,
  });
  return drizzle(serializeWrites(client), { schema });
}

export { schema };
