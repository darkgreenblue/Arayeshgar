/**
 * Integration-test fixtures.
 *
 * With SQLite there is nothing to stand up: each test file gets its own throwaway
 * database file in the OS temp directory, migrated at import time. That means
 * `pnpm test` needs no services at all, and no test can see another file's rows —
 * which is what previously made an outbox assertion count every fixture's messages.
 * Set DATABASE_URL to point them all at one database instead.
 */
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_BOOKING_RULES,
  DEFAULT_DEPOSIT_SETTINGS,
  DEFAULT_FEATURES,
  createDb,
  defaultBranding,
  deleteTenant,
  schedules,
  services,
  staff,
  staffServices,
  tenants,
  users,
  runMigrations,
  type Db,
  type Tenant,
} from "@arayeshgar/db";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-test";
process.env.BASE_DOMAIN ??= "localhost";

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  path.join(tmpdir(), `arayeshgar-test-${randomBytes(6).toString("hex")}.db`);

if (!process.env.DATABASE_URL) {
  process.on("exit", () => {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        rmSync(DATABASE_URL + suffix);
      } catch {
        /* already gone */
      }
    }
  });
}

// Core reads DATABASE_URL through getEnv(), so the generated path has to be visible
// there too, not just to the fixtures.
process.env.DATABASE_URL = DATABASE_URL;

// Top-level await: the schema has to exist before any test body runs.
await runMigrations(DATABASE_URL);

let shared: Db | undefined;
export function testDb(): Db {
  if (!shared) shared = createDb(DATABASE_URL);
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
      await deleteTenant(db, tenant.id);
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
