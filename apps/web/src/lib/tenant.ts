import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { tenants, type Tenant } from "@arayeshgar/db";
import { getEnv } from "@arayeshgar/core";
import { db } from "./db";

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

export type Resolved =
  { kind: "platform"; tenant: null } | { kind: "tenant" | "custom"; tenant: Tenant | null };

export async function resolveTenantByHost(hostHeader: string): Promise<Resolved> {
  const k = classifyHost(hostHeader, getEnv().BASE_DOMAIN);
  if (k.kind === "platform") return { kind: "platform", tenant: null };
  const tenant = await db().query.tenants.findFirst({
    where: k.kind === "tenant" ? eq(tenants.slug, k.slug) : eq(tenants.customDomain, k.host),
  });
  return { kind: k.kind, tenant: tenant ?? null };
}

/** Per-request memoized tenant from the incoming Host header. */
export const currentTenant = cache(async (): Promise<Resolved> => {
  const host = (await headers()).get("host") ?? "";
  return resolveTenantByHost(host);
});

/** Throws a 404-ish error for pages that need a live tenant. */
export async function requireTenant(): Promise<Tenant> {
  const r = await currentTenant();
  if (!r.tenant || r.tenant.status === "suspended") throw new TenantNotFoundError();
  return r.tenant;
}

export class TenantNotFoundError extends Error {
  constructor() {
    super("tenant not found");
  }
}
