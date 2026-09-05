import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Creates a Drizzle client over a postgres-js pool.
 * One instance per process; pass it explicitly (no globals) so tests can swap it.
 */
export function createDb(url = process.env.DATABASE_URL, opts: { max?: number } = {}) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => {},
  });
  return drizzle(sql, { schema });
}

export { schema };
