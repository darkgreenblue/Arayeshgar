import { eq } from "drizzle-orm";
import { tenants } from "@arayeshgar/db";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Caddy on-demand TLS gate: only issue certificates for domains registered to a tenant. */
export async function GET(req: Request) {
  const domain = new URL(req.url).searchParams.get("domain")?.toLowerCase();
  if (!domain) return new Response("missing domain", { status: 400 });
  const t = await db().query.tenants.findFirst({
    where: eq(tenants.customDomain, domain),
    columns: { id: true, status: true },
  });
  if (!t || t.status === "suspended") return new Response("unknown domain", { status: 404 });
  return new Response("ok");
}
