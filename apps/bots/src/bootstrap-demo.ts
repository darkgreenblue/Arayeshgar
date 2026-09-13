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
import { and, eq, inArray, sql } from "drizzle-orm";
import { logger, platformSetCustomDomain } from "@arayeshgar/core";
import { createDb, seed, tenants, users } from "@arayeshgar/db";

/**
 * Point the demo tenant's own admin notifications at the owner's Telegram chat.
 *
 * **Without this, the single most important moment of the sales demo does nothing.**
 * `adminRecipients()` only notifies rows where all three hold: `tenant_id` = this tenant,
 * `role ∈ (owner, manager)`, and a linked chat id. The seeded owner has no chat id, and the
 * `ADMIN_IDS` bootstrap row is a `platform_admin` with `tenant_id = NULL` — so it matches
 * neither clause. Measured on the deployed database: **zero recipients.** A barber would be
 * shown a booking that notifies nobody.
 *
 * So the chat id from `ADMIN_IDS` is attached to the demo tenant's owner. Three things then
 * become true at once, which is exactly what the demo needs:
 *   - that chat receives every booking and receipt (it is now an `owner` of this tenant),
 *   - that same chat can still book as an ordinary customer — the booking flow never checks
 *     role, and `/admin` is a separate command, so the two roles are additive not exclusive,
 *   - swapping to a different person later is one secret change, no code.
 *
 * Deliberately only ever touches tenants in `demo` status: a sold customer's owner must be
 * linked by their own `/link` code, never silently pointed at us.
 */
async function linkDemoAdminChat(db: ReturnType<typeof createDb>, tenantId: string) {
  const raw = process.env.ADMIN_IDS ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^-?\d+$/.test(s));
  if (ids.length === 0) {
    logger.warn({}, "ADMIN_IDS has no numeric id — demo bookings will notify nobody");
    return;
  }
  const chatId = Number(ids[0]);

  const owner = await db.query.users.findFirst({
    where: and(eq(users.tenantId, tenantId), inArray(users.role, ["owner", "manager"])),
  });
  if (!owner) {
    logger.warn({ tenantId }, "demo tenant has no owner user to attach a chat to");
    return;
  }
  if (owner.telegramChatId === chatId) {
    logger.info({ userId: owner.id }, "demo admin chat already linked");
    return;
  }
  await db.update(users).set({ telegramChatId: chatId }).where(eq(users.id, owner.id));
  logger.info(
    { userId: owner.id, role: owner.role },
    "demo admin chat linked — booking receipts will now reach it",
  );
}

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

  // The demo tenant by slug, or failing that any tenant still in `demo` status. A server
  // running a sold customer must never have its domain rewritten, or its owner's chat
  // repointed, by a deploy.
  let target = await db.query.tenants.findFirst({ where: eq(tenants.slug, "demo") });
  target ??= await db.query.tenants.findFirst({ where: eq(tenants.status, "demo") });
  if (!target) {
    logger.warn({}, "no demo tenant on this server — nothing to bootstrap");
    return;
  }

  // Before the hostname, because this one matters even when the tunnel gave us no URL:
  // a demo whose bookings notify nobody is broken in a way nothing else would reveal.
  if (target.status === "demo") await linkDemoAdminChat(db, target.id);

  if (!host) {
    logger.info({}, "no hostname given — demo domain left as is");
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
