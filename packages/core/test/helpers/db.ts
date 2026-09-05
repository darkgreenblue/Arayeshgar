/**
 * Integration-test fixtures. Each call creates an isolated tenant (random slug) so tests can run in
 * parallel against one database. Requires DATABASE_URL with migrations applied.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  DEFAULT_BOOKING_RULES,
  DEFAULT_DEPOSIT_SETTINGS,
  DEFAULT_FEATURES,
  createDb,
  defaultBranding,
  schedules,
  services,
  staff,
  staffServices,
  tenants,
  users,
  type Db,
  type Tenant,
} from "@arayeshgar/db";

export const DATABASE_URL = process.env.DATABASE_URL;
export const hasDb = Boolean(DATABASE_URL);

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-test";
process.env.BASE_DOMAIN ??= "localhost";

let shared: Db | undefined;
export function testDb(): Db {
  if (!shared) shared = createDb(DATABASE_URL, { max: 8 });
  return shared;
}

export type Fixture = {
  tenant: Tenant;
  staffId: string;
  staff2Id: string;
  serviceId: string; // 30 min, 250,000
  ownerId: string;
  cleanup: () => Promise<void>;
};

export async function makeTenant(
  db: Db,
  opts: {
    deposit?: boolean;
    mode?: Tenant["mode"];
    autoConfirm?: boolean;
    features?: Record<string, boolean>;
  } = {},
): Promise<Fixture> {
  const slug = `t${randomBytes(4).toString("hex")}`;
  const [tenant] = await db
    .insert(tenants)
    .values({
      slug,
      name: slug,
      mode: opts.mode ?? "solo",
      branding: defaultBranding(slug),
      features: { ...DEFAULT_FEATURES, deposit: opts.deposit ?? false, ...(opts.features ?? {}) },
      bookingRules: {
        ...DEFAULT_BOOKING_RULES,
        autoConfirmWithoutDeposit: opts.autoConfirm ?? true,
      },
      depositSettings: {
        ...DEFAULT_DEPOSIT_SETTINGS,
        enabled: opts.deposit ?? false,
        mode: "fixed",
        amount: 100000,
        cardNumber: "6037991234567890",
        cardHolder: "تست",
      },
      webhookSecret: "s",
    })
    .returning();
  if (!tenant) throw new Error("fixture tenant");
  const [s1] = await db
    .insert(staff)
    .values({ tenantId: tenant.id, name: "آرایشگر ۱" })
    .returning();
  const [s2] = await db
    .insert(staff)
    .values({ tenantId: tenant.id, name: "آرایشگر ۲" })
    .returning();
  const [svc] = await db
    .insert(services)
    .values({ tenantId: tenant.id, name: "اصلاح", durationMin: 30, price: 250000 })
    .returning();
  if (!s1 || !s2 || !svc) throw new Error("fixture rows");
  await db.insert(staffServices).values([
    { staffId: s1.id, serviceId: svc.id },
    { staffId: s2.id, serviceId: svc.id },
  ]);
  // every day 09:00-21:00 for both
  const rows = [];
  for (let wd = 0; wd <= 6; wd++)
    for (const sid of [s1.id, s2.id])
      rows.push({
        tenantId: tenant.id,
        staffId: sid,
        weekday: wd,
        startMin: 9 * 60,
        endMin: 21 * 60,
      });
  await db.insert(schedules).values(rows);
  const [owner] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      role: "owner",
      username: "owner",
      passwordHash: "x",
      displayName: "Owner",
      telegramChatId: 111,
    })
    .returning();
  if (!owner) throw new Error("fixture owner");
  return {
    tenant,
    staffId: s1.id,
    staff2Id: s2.id,
    serviceId: svc.id,
    ownerId: owner.id,
    cleanup: async () => {
      await db.delete(tenants).where(eq(tenants.id, tenant.id)); // cascades
    },
  };
}

/** A start instant tomorrow at HH:MM Tehran (always inside the fixture schedule and horizon). */
export function tomorrowAt(hour: number, minute = 0): Date {
  const now = new Date();
  const tehran = new Date(now.getTime() + 210 * 60_000);
  const d = new Date(
    Date.UTC(tehran.getUTCFullYear(), tehran.getUTCMonth(), tehran.getUTCDate() + 1, hour, minute),
  );
  return new Date(d.getTime() - 210 * 60_000);
}
