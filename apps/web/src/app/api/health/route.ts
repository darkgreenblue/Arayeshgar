import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * Liveness, plus the one question a deploy cannot answer any other way: **does the host the
 * request arrived on actually resolve to a tenant?**
 *
 * `host` exists because the obvious check turned out to be vacuous. The deploy used to
 * assert that `GET /` returns 200 on the tunnel hostname, and it always does — an unmapped
 * host renders the friendly "این آدرس هنوز به آرایشگری متصل نیست" page with a 200, since
 * `/` never calls `requireTenant()`. So the check passed even with no mapping at all, which
 * is precisely the failure it was written to catch. Scraping the HTML for that sentence
 * would work until somebody reworded it; reporting the resolution is stable.
 *
 * Cheap on purpose: `currentTenant()` is the same per-request memoized lookup every page
 * does, and nothing here is secret — only whether a hostname is claimed, and by which slug.
 */
export async function GET() {
  try {
    await db().get(sql`select 1`);
  } catch {
    return Response.json({ ok: false, service: "web", db: "down" }, { status: 503 });
  }

  let host: { kind: string; tenant: string | null; status: string | null } | null = null;
  try {
    const r = await currentTenant();
    host = { kind: r.kind, tenant: r.tenant?.slug ?? null, status: r.tenant?.status ?? null };
  } catch {
    // Never let tenant resolution turn a healthy process into a failed deploy.
    host = null;
  }

  return Response.json({ ok: true, service: "web", db: "up", host });
}
