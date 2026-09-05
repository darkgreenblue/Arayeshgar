/**
 * Platform-owner operations: the list of customers, flag toggles, custom domains and the
 * demo → active switch. These are the only cross-tenant queries in the codebase and every one of
 * them is named `platform*` on purpose.
 */
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { bookings, tenants, users, type Db, type Tenant } from "@arayeshgar/db";
import { Errors } from "../errors/domain";
import { FEATURE_KEYS, normalizeFeatures, type FeatureKey } from "../features/registry";
import { hashPassword } from "../auth/password";

export type TenantSummary = Tenant & {
  bookings30d: number;
  upcoming: number;
  owner: string | null;
};

export async function platformListTenants(db: Db): Promise<TenantSummary[]> {
  const rows = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const since = new Date(Date.now() - 30 * 24 * 3_600_000);
  const [recent, upcoming, owners] = await Promise.all([
    db
      .select({ tenantId: bookings.tenantId, n: count() })
      .from(bookings)
      .where(and(inArray(bookings.tenantId, ids), gte(bookings.createdAt, since)))
      .groupBy(bookings.tenantId),
    db
      .select({ tenantId: bookings.tenantId, n: count() })
      .from(bookings)
      .where(
        and(
          inArray(bookings.tenantId, ids),
          gte(bookings.startAt, new Date()),
          inArray(bookings.status, [
            "confirmed",
            "pending_payment",
            "receipt_submitted",
            "pending_approval",
          ]),
        ),
      )
      .groupBy(bookings.tenantId),
    db
      .select({ tenantId: users.tenantId, username: users.username })
      .from(users)
      .where(and(inArray(users.tenantId, ids), eq(users.role, "owner"))),
  ]);
  return rows.map((t) => ({
    ...t,
    bookings30d: Number(recent.find((r) => r.tenantId === t.id)?.n ?? 0),
    upcoming: Number(upcoming.find((r) => r.tenantId === t.id)?.n ?? 0),
    owner: owners.find((o) => o.tenantId === t.id)?.username ?? null,
  }));
}

export async function platformSetFeatures(
  db: Db,
  tenantId: string,
  patch: Partial<Record<FeatureKey, boolean>>,
) {
  const t = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  if (!t) throw Errors.notFound("آرایشگر");
  const features = normalizeFeatures({ ...t.features, ...patch });
  await db.update(tenants).set({ features, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
  return features;
}

export async function platformSetStatus(
  db: Db,
  tenantId: string,
  status: "demo" | "active" | "suspended",
) {
  const [row] = await db
    .update(tenants)
    .set({ status, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))
    .returning();
  if (!row) throw Errors.notFound("آرایشگر");
  return row;
}

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export async function platformSetCustomDomain(db: Db, tenantId: string, domain: string | null) {
  const value =
    domain
      ?.trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "") || null;
  if (value && !DOMAIN_RE.test(value))
    throw Errors.validation("دامنه معتبر نیست. نمونه: alibarber.ir");
  const clash = value
    ? await db.query.tenants.findFirst({
        where: eq(tenants.customDomain, value),
        columns: { id: true },
      })
    : null;
  if (clash && clash.id !== tenantId)
    throw Errors.validation("این دامنه برای آرایشگر دیگری ثبت شده است.");
  const [row] = await db
    .update(tenants)
    .set({ customDomain: value, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))
    .returning();
  if (!row) throw Errors.notFound("آرایشگر");
  return row;
}

export async function platformSetBotTokens(
  db: Db,
  tenantId: string,
  tokens: { telegram?: string | null; bale?: string | null },
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (tokens.telegram !== undefined) patch.telegramBotToken = tokens.telegram || null;
  if (tokens.bale !== undefined) patch.baleBotToken = tokens.bale || null;
  const [row] = await db.update(tenants).set(patch).where(eq(tenants.id, tenantId)).returning();
  if (!row) throw Errors.notFound("آرایشگر");
  return row;
}

/** Lets the platform owner reset a barber's password when they lock themselves out. */
export async function platformResetOwnerPassword(db: Db, tenantId: string, newPassword: string) {
  if (newPassword.length < 8) throw Errors.validation("رمز حداقل ۸ کاراکتر.");
  const owner = await db.query.users.findFirst({
    where: and(eq(users.tenantId, tenantId), eq(users.role, "owner")),
  });
  if (!owner) throw Errors.notFound("حساب مالک");
  await db
    .update(users)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(users.id, owner.id));
  return owner.username;
}

export async function platformStats(db: Db) {
  const [t] = await db.select({ n: count() }).from(tenants);
  const [active] = await db
    .select({ n: count() })
    .from(tenants)
    .where(eq(tenants.status, "active"));
  const [b] = await db
    .select({ n: count() })
    .from(bookings)
    .where(gte(bookings.createdAt, new Date(Date.now() - 30 * 24 * 3_600_000)));
  const [pendingNotifs] = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from notification_outbox where sent_at is null`,
  );
  return {
    tenants: Number(t?.n ?? 0),
    activeTenants: Number(active?.n ?? 0),
    bookings30d: Number(b?.n ?? 0),
    pendingNotifications: Number(pendingNotifs?.n ?? 0),
  };
}

export { FEATURE_KEYS };
