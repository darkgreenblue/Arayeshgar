import "server-only";
import { eq, or } from "drizzle-orm";
import { createDb, tenants } from "@arayeshgar/db";
import { getEnv } from "@arayeshgar/core";

declare global {
  var __arayeshgarDb: ReturnType<typeof createDb> | undefined;
}
export function db() {
  if (!globalThis.__arayeshgarDb) globalThis.__arayeshgarDb = createDb(getEnv().DATABASE_URL);
  return globalThis.__arayeshgarDb;
}

export type HostKind =
  { kind: "platform" } | { kind: "tenant"; slug: string } | { kind: "custom"; host: string };

/**
 * Explicit precedence: platform.<base> -> tenant slug under <base> or localhost -> custom domain.
 * Pure function so it is unit-testable without a DB.
 */
export function classifyHost(hostHeader: string, baseDomain: string): HostKind {
  const host = hostHeader.split(":")[0]!.toLowerCase();
  const bases = new Set([baseDomain.toLowerCase(), "localhost"]);
  for (const base of bases) {
    if (host === `platform.${base}`) return { kind: "platform" };
    if (host.endsWith(`.${base}`)) {
      const slug = host.slice(0, -(base.length + 1));
      if (slug && !slug.includes(".")) return { kind: "tenant", slug };
    }
  }
  return { kind: "custom", host };
}

export async function resolveTenant(hostHeader: string) {
  const env = getEnv();
  const k = classifyHost(hostHeader, env.BASE_DOMAIN);
  if (k.kind === "platform") return { kind: "platform" as const, tenant: null };
  const where =
    k.kind === "tenant"
      ? eq(tenants.slug, k.slug)
      : or(eq(tenants.customDomain, k.host), eq(tenants.slug, "__never__"));
  const tenant = await db().query.tenants.findFirst({ where });
  return { kind: k.kind, tenant: tenant ?? null };
}
