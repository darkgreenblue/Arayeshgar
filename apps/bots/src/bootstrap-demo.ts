/**
 * `node bots/bootstrap-demo.js [hostname]` — makes a freshly deployed server demoable.
 *
 * Two things a deploy alone does not give you, and both are needed before the link a
 * salesperson opens shows anything:
 *
 *  1. **Something to show.** Migrations create empty tables. Without a tenant, every page
 *     throws `TenantNotFoundError`. So on a database with no tenants at all, this seeds the
 *     demo one — branding, a barber, three services, working hours, deposit settings.
 *
 *  2. **A hostname that resolves to it.** `classifyHost` sends anything that is not
 *     `platform.<base>` or `<slug>.<base>` down the `custom_domain` path, and a Cloudflare
 *     quick-tunnel hostname matches neither. Without registering it, the demo link 404s —
 *     which is exactly how this would have shipped looking broken. And because a quick
 *     tunnel gets a *new* hostname on every restart, this has to run on every deploy, not
 *     once.
 *
 * Idempotent on both counts: seeding is skipped when any tenant exists, and setting the
 * domain is a no-op when it already matches.
 */
import { eq, sql } from "drizzle-orm";
import { logger, platformSetCustomDomain } from "@arayeshgar/core";
import { createDb, seed, tenants } from "@arayeshgar/db";

async function main() {
  const host = process.argv[2]
    ?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const db = createDb();

  const count = await db.get<{ n: number }>(sql`select count(*) as n from tenants`);
  if (!count || count.n === 0) {
    logger.info({}, "no tenants at all — seeding the demo tenant");
    await seed();
  } else {
    logger.info({ tenants: count.n }, "tenants already exist — not seeding");
  }

  if (!host) {
    logger.info({}, "no hostname given — demo domain left as is");
    return;
  }

  // The demo tenant by slug, or failing that any tenant still in `demo` status. A server
  // running a sold customer must never have its domain rewritten by a deploy.
  let target = await db.query.tenants.findFirst({ where: eq(tenants.slug, "demo") });
  target ??= await db.query.tenants.findFirst({ where: eq(tenants.status, "demo") });
  if (!target) {
    logger.warn({ host }, "no demo tenant to point the hostname at — leaving it alone");
    return;
  }
  if (target.customDomain === host) {
    logger.info({ host, slug: target.slug }, "demo hostname already set");
    return;
  }

  // Another tenant may still hold this hostname from an earlier tunnel; custom_domain is
  // unique, so clear the stale one first or the update fails.
  const holder = await db.query.tenants.findFirst({ where: eq(tenants.customDomain, host) });
  if (holder && holder.id !== target.id) {
    await platformSetCustomDomain(db, holder.id, null);
    logger.info({ host, freedFrom: holder.slug }, "released hostname from a previous tenant");
  }

  await platformSetCustomDomain(db, target.id, host);
  logger.info({ host, slug: target.slug }, "demo hostname now points at the demo tenant");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err: String(err) }, "bootstrap-demo failed");
    process.exit(1);
  });
