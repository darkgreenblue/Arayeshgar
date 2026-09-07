import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { resolveDbUrl } from "./client";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_FOLDER = path.resolve(here, "../drizzle");

/** Applies all pending SQL migrations in ./drizzle. Safe to run on every deploy. */
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

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runMigrations()
    .then(() => {
      console.error("[db] migrations applied");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[db] migration failed", err);
      process.exit(1);
    });
}
