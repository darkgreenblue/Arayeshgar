import "server-only";
import { createDb } from "@arayeshgar/db";
import { getEnv } from "@arayeshgar/core";

declare global {
  var __arayeshgarDb: ReturnType<typeof createDb> | undefined;
}

/** One pool per Node process (survives Next.js HMR via globalThis). */
export function db() {
  if (!globalThis.__arayeshgarDb) globalThis.__arayeshgarDb = createDb(getEnv().DATABASE_URL);
  return globalThis.__arayeshgarDb;
}
