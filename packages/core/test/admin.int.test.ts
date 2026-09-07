import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { customers, schedules, services, staff, tenants, users } from "@arayeshgar/db";
import { availableSlots, resolveServiceForStaff } from "../src/availability/availability";
import { createBooking } from "../src/booking/create";
import { markNoShow } from "../src/booking/transitions";
import { addOverride, getWeekly, setWeekly } from "../src/admin/schedule";
import { deactivateService, listServices, upsertService } from "../src/admin/services";
import { listStaff, setStaffLogin, upsertStaff } from "../src/admin/staff";
import {
  customerHistory,
  searchCustomers,
  setCustomerBlocked,
  setCustomerNotes,
} from "../src/admin/customers";
import {
  changePassword,
  consumeBotLinkCode,
  issueBotLinkCode,
  setTheme,
  updateDeposit,
  updateRules,
} from "../src/admin/settings";
import { hashPassword, verifyPassword } from "../src/auth/password";
import { localDateOf, isoDate, addDays } from "../src/utils/jalali";
import { makeTenant, testDb, tomorrowAt, type Fixture } from "./helpers/db";

describe("admin modules (SQLite)", () => {
  const db = testDb();
  const fixtures: Fixture[] = [];
  const fx = async (opts?: Parameters<typeof makeTenant>[1]) => {
    const f = await makeTenant(db, opts);
    fixtures.push(f);
    return f;
  };
  afterAll(async () => {
    for (const f of fixtures) await f.cleanup();
  });

  it("service upsert links staff, overrides duration/price and deactivation hides it", async () => {
    const f = await fx({ mode: "salon_central" });
    const id = await upsertService(db, f.tenant.id, {
      name: "رنگ مو",
      durationMin: 90,
      price: 800000,
      sortOrder: 2,
      isActive: true,
      staffIds: [f.staffId],
    });
    const list = await listServices(db, f.tenant.id);
    const created = list.find((s) => s.id === id)!;
    expect(created.durationMin).toBe(90);
    expect(created.staffIds).toEqual([f.staffId]);
    // only the linked staff can serve it
    expect(await resolveServiceForStaff(db, f.staffId, id)).toMatchObject({
      durationMin: 90,
      price: 800000,
    });
    expect(await resolveServiceForStaff(db, f.staff2Id, id)).toBeNull();
    await deactivateService(db, f.tenant.id, id);
    expect(await resolveServiceForStaff(db, f.staffId, id)).toBeNull();
  });

  it("weekly schedule replace rejects overlaps and changes the offered slots", async () => {
    const f = await fx();
    await expect(
      setWeekly(db, f.tenant.id, f.staffId, [
        { weekday: 0, startMin: 600, endMin: 720 },
        { weekday: 0, startMin: 700, endMin: 800 },
      ]),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const day = localDateOf(tomorrowAt(10), f.tenant.timezone);
    const weekday = (new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay() + 1) % 7;
    await setWeekly(db, f.tenant.id, f.staffId, [{ weekday, startMin: 10 * 60, endMin: 12 * 60 }]);
    expect(await getWeekly(db, f.staffId)).toHaveLength(1);
    const slots = await availableSlots(db, f.tenant, {
      staffId: f.staffId,
      serviceId: f.serviceId,
      day,
    });
    const starts = slots[0]!.starts.map((d) => d.getTime());
    expect(starts).toContain(tomorrowAt(10).getTime());
    expect(starts).toContain(tomorrowAt(11, 30).getTime());
    expect(starts).not.toContain(tomorrowAt(13).getTime()); // outside the new window
  });

  it("a closed override removes the day entirely; a partial close cuts a hole", async () => {
    const f = await fx();
    const day = localDateOf(tomorrowAt(10), f.tenant.timezone);
    await addOverride(db, f.tenant.id, {
      staffId: f.staffId,
      day: isoDate(day),
      kind: "closed",
      startMin: 12 * 60,
      endMin: 14 * 60,
    });
    const slots1 = await availableSlots(db, f.tenant, {
      staffId: f.staffId,
      serviceId: f.serviceId,
      day,
    });
    const starts = slots1[0]!.starts.map((d) => d.getTime());
    expect(starts).toContain(tomorrowAt(11).getTime());
    expect(starts).not.toContain(tomorrowAt(12, 30).getTime());

    const next = addDays(day, 1);
    await addOverride(db, f.tenant.id, {
      staffId: f.staffId,
      day: isoDate(next),
      kind: "closed",
      reason: "مرخصی",
    });
    const slots2 = await availableSlots(db, f.tenant, {
      staffId: f.staffId,
      serviceId: f.serviceId,
      day: next,
    });
    expect(slots2[0]!.starts).toHaveLength(0);
  });

  it("staff editor stores an own deposit card and can issue a scoped login", async () => {
    const f = await fx({ mode: "salon_independent" });
    await upsertStaff(db, f.tenant.id, {
      id: f.staffId,
      name: "آرایشگر ۱",
      sortOrder: 0,
      isActive: true,
      depositSettings: { cardNumber: "5555666677778888", cardHolder: "خودش" },
    });
    const userId = await setStaffLogin(db, f.tenant.id, f.staffId, "Barber.One", "supersecret");
    const rows = await listStaff(db, f.tenant.id);
    const s1 = rows.find((s) => s.id === f.staffId)!;
    expect(s1.depositSettings?.cardNumber).toBe("5555666677778888");
    expect(s1.login?.username).toBe("barber.one");
    const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(u?.role).toBe("staff");
    expect(verifyPassword("supersecret", u!.passwordHash)).toBe(true);
    // duplicate username is refused
    await expect(
      setStaffLogin(db, f.tenant.id, f.staff2Id, "barber.one", "anotherpass"),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      setStaffLogin(db, f.tenant.id, f.staff2Id, "ok.name", "short"),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("customer search aggregates counts, notes and blocking stop new bookings", async () => {
    const f = await fx();
    const r = await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(9, 30),
      customer: { name: "سارا", phone: "09127770001" },
      source: "web",
    });
    await markNoShow(db, f.tenant.id, r.bookingId, f.ownerId);
    const found = await searchCustomers(db, f.tenant.id, "سارا");
    expect(found[0]).toMatchObject({ name: "سارا", total: 1, noShows: 1 });
    expect((await searchCustomers(db, f.tenant.id, "0912 777 0001"))[0]?.phone).toBe("09127770001");

    const id = found[0]!.id;
    await setCustomerNotes(db, f.tenant.id, id, "همیشه فید کوتاه");
    const { customer, history } = await customerHistory(db, f.tenant.id, id);
    expect(customer.notes).toBe("همیشه فید کوتاه");
    expect(history).toHaveLength(1);

    await setCustomerBlocked(db, f.tenant.id, id, true);
    await expect(
      createBooking(db, {
        tenant: f.tenant,
        staffId: f.staffId,
        serviceId: f.serviceId,
        startAt: tomorrowAt(15),
        customer: { name: "سارا", phone: "09127770001" },
        source: "web",
      }),
    ).rejects.toMatchObject({ code: "CUSTOMER_BLOCKED" });
    await setCustomerBlocked(db, f.tenant.id, id, false);
  });

  it("settings validate deposit, rules and theme; password change requires the current one", async () => {
    const f = await fx();
    await expect(
      updateDeposit(db, f.tenant.id, { enabled: true, mode: "fixed", amount: 50000 }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await updateDeposit(db, f.tenant.id, {
      enabled: true,
      mode: "percent",
      amount: 30,
      cardNumber: "6037991234567890",
      cardHolder: "علی",
    });
    await expect(
      updateRules(db, f.tenant.id, { ...f.tenant.bookingRules, slotStepMin: 1 }),
    ).rejects.toThrow();
    await updateRules(db, f.tenant.id, { ...f.tenant.bookingRules, slotStepMin: 30 });
    await expect(setTheme(db, f.tenant.id, "nope")).rejects.toMatchObject({ code: "VALIDATION" });
    await setTheme(db, f.tenant.id, "bold-modern");
    const t = await db.query.tenants.findFirst({ where: eq(tenants.id, f.tenant.id) });
    expect(t?.theme).toBe("bold-modern");
    expect(t?.depositSettings.mode).toBe("percent");
    expect(t?.bookingRules.slotStepMin).toBe(30);

    await db
      .update(users)
      .set({ passwordHash: hashPassword("oldpassword") })
      .where(eq(users.id, f.ownerId));
    await expect(
      changePassword(db, f.ownerId, { current: "wrong", next: "newpassword" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await changePassword(db, f.ownerId, { current: "oldpassword", next: "newpassword" });
    const u = await db.query.users.findFirst({ where: eq(users.id, f.ownerId) });
    expect(verifyPassword("newpassword", u!.passwordHash)).toBe(true);
  });

  it("bot link code binds a chat once and then expires", async () => {
    const f = await fx();
    const { code } = await issueBotLinkCode(db, f.ownerId);
    expect(code).toMatch(/^\d{6}$/);
    expect(await consumeBotLinkCode(db, f.tenant.id, "000000", "telegram", 42)).toBeNull();
    const u = await consumeBotLinkCode(db, f.tenant.id, code, "bale", 4242);
    expect(u?.id).toBe(f.ownerId);
    const after = await db.query.users.findFirst({ where: eq(users.id, f.ownerId) });
    expect(after?.baleChatId).toBe(4242);
    expect(after?.botLinkCode).toBeNull();
    // code cannot be reused
    expect(await consumeBotLinkCode(db, f.tenant.id, code, "telegram", 1)).toBeNull();
  });

  it("deleting a tenant cascades all its data (extraction/cleanup safety)", async () => {
    const f = await makeTenant(db);
    await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(16, 30),
      customer: { name: "کاربر", phone: "09128880001" },
      source: "web",
    });
    await f.cleanup();
    for (const [table, col] of [
      [staff, staff.tenantId],
      [services, services.tenantId],
      [schedules, schedules.tenantId],
      [customers, customers.tenantId],
      [users, users.tenantId],
    ] as const) {
      expect(await db.select().from(table).where(eq(col, f.tenant.id))).toHaveLength(0);
    }
  });
});
