import { randomBytes, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOOKING_RULES,
  DEFAULT_DEPOSIT_SETTINGS,
  DEFAULT_FEATURES,
  createDb,
  defaultBranding,
  deleteTenant,
  runMigrations,
  staff,
  tenants,
  users,
} from "@arayeshgar/db";
import { adminRecipients } from "@arayeshgar/core";
import { REZA_HOSSEINI_SLUG, reconcileRezaDemo } from "../src/reza-demo";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-test";
process.env.BASE_DOMAIN ??= "localhost";
const dbUrl = path.join(tmpdir(), `arayeshgar-reza-demo-${randomBytes(6).toString("hex")}.db`);
await runMigrations(dbUrl);
const db = createDb(dbUrl);
process.on("exit", () => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(dbUrl + suffix);
    } catch {
      // Test cleanup is best-effort on a temporary database.
    }
  }
});

describe("Reza Hosseini demo reconciliation", () => {
  it("enables only Reza's valid deposit and gives every platform admin a review recipient", async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({
        slug: REZA_HOSSEINI_SLUG,
        name: "رضا حسینی",
        branding: defaultBranding("رضا حسینی"),
        features: { ...DEFAULT_FEATURES, deposit: false, telegram_bot: false },
        bookingRules: DEFAULT_BOOKING_RULES,
        depositSettings: {
          ...DEFAULT_DEPOSIT_SETTINGS,
          enabled: false,
          mode: "fixed",
          amount: 100000,
          cardNumber: "6037991234567890",
          cardHolder: "رضا حسینی",
        },
        webhookSecret: randomUUID(),
      })
      .returning();
    if (!tenant) throw new Error("Reza test tenant was not created");
    const [barber] = await db
      .insert(staff)
      .values({ tenantId: tenant.id, name: "رضا حسینی" })
      .returning();
    if (!barber) throw new Error("Reza test barber was not created");
    try {
      for (const chatId of [91001, 91002]) {
        await db.insert(users).values({
          id: randomUUID(),
          tenantId: null,
          role: "platform_admin",
          username: `platform-${chatId}`,
          passwordHash: "not-a-login",
          displayName: `ادمین ${chatId}`,
          telegramChatId: chatId,
          isActive: true,
        });
      }

      const result = await reconcileRezaDemo(db);
      expect(result).toEqual({ found: true, enabledDeposit: true, linkedAdmins: 2 });

      const updatedTenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenant.id) });
      expect(updatedTenant?.features.deposit).toBe(true);
      expect(updatedTenant?.features.telegram_bot).toBe(true);
      expect(updatedTenant?.depositSettings.enabled).toBe(true);
      const recipients = await adminRecipients(db, updatedTenant!, barber.id);
      expect(recipients).toEqual(
        expect.arrayContaining([
          { channel: "telegram", chatId: "91001" },
          { channel: "telegram", chatId: "91002" },
        ]),
      );
      const managers = await db.query.users.findMany({
        where: and(eq(users.tenantId, tenant.id), eq(users.role, "manager")),
      });
      expect(managers.map((u) => u.telegramChatId).sort()).toEqual([91001, 91002]);

      // A re-run is safe; it neither duplicates identities nor touches another tenant.
      expect(await reconcileRezaDemo(db)).toEqual({
        found: true,
        enabledDeposit: true,
        linkedAdmins: 2,
      });
      const otherPlatformRows = await db.query.users.findMany({
        where: and(isNull(users.tenantId), eq(users.role, "platform_admin")),
      });
      expect(otherPlatformRows).toHaveLength(2);
    } finally {
      await deleteTenant(db, tenant.id);
    }
  });
});
