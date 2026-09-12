import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { resolveDbUrl } from "./client";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the `.sql` files live. Beside this package in a checkout; but a bundled or otherwise
 * relocated build has no `packages/db` next to it, so `MIGRATIONS_DIR` lets the deploy point
 * at wherever it actually shipped them.
 */
export const MIGRATIONS_FOLDER = process.env.MIGRATIONS_DIR ?? path.resolve(here, "../drizzle");

/**
 * Applies all pending SQL migrations. Safe to run on every deploy.
 *
 * Nothing calls this on its own — importing this module has no side effects. `db:migrate`
 * goes through `migrate-cli.ts`; see the note there for why that split matters.
 */
export async function runMigrations(url?: string) {
  const client = createClient({ url: resolveDbUrl(url) });
  try {
    // WAL is written into the file header, so setting it here makes it permanent
    // for every process that opens the database afterwards.
    await client.execute("PRAGMA journal_mode = WAL");
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    client.close();
  }
}
