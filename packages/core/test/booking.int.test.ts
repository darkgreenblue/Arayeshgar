import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookings, notificationOutbox, payments, tenants } from "@arayeshgar/db";
import { createBooking } from "../src/booking/create";
import {
  approveReceipt,
  cancelByAdmin,
  cancelByCustomer,
  expireBooking,
  rejectReceipt,
  rescheduleBooking,
  submitReceipt,
} from "../src/booking/transitions";
import { availableSlots, availableDays } from "../src/availability/availability";
import { DomainError } from "../src/errors/domain";
import { drainOutbox } from "../src/notifications/outbox";
import { expireBookings } from "../src/worker/jobs";
import { localDateOf } from "../src/utils/jalali";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DATABASE_URL, makeTenant, testDb, tomorrowAt, type Fixture } from "./helpers/db";

describe("booking engine (SQLite)", () => {
  const db = testDb();
  const fixtures: Fixture[] = [];
  const fx = async (opts?: Parameters<typeof makeTenant>[1]) => {
    const f = await makeTenant(db, opts);
    fixtures.push(f);
    return f;
  };
  beforeAll(() => {});
  afterAll(async () => {
    for (const f of fixtures) await f.cleanup();
  });

  it("lists slots from the weekly schedule and hides them after booking", async () => {
    const f = await fx();
    const day = localDateOf(tomorrowAt(10), f.tenant.timezone);
    const before = await availableSlots(db, f.tenant, {
      staffId: f.staffId,
      serviceId: f.serviceId,
      day,
    });
    expect(before[0]?.starts.length).toBeGreaterThan(20);
    expect(before[0]?.starts.some((d) => d.getTime() === tomorrowAt(10).getTime())).toBe(true);

    await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(10),
      customer: { name: "رضا", phone: "0912 000 0001" },
      source: "web",
    });

    const after = await availableSlots(db, f.tenant, {
      staffId: f.staffId,
      serviceId: f.serviceId,
      day,
    });
    const starts = after[0]!.starts.map((d) => d.getTime());
    expect(starts).not.toContain(tomorrowAt(10).getTime());
    expect(starts).not.toContain(tomorrowAt(10, 15).getTime()); // would overlap 10:00-10:30
    expect(starts).toContain(tomorrowAt(10, 30).getTime());
    const days = await availableDays(db, f.tenant, { staffId: f.staffId, serviceId: f.serviceId });
    expect(days.length).toBeGreaterThan(10);
  });

  it("skipAbuseLimits bypasses the daily cap but leaves deposit/status behavior untouched", async () => {
    // No deposit, auto-confirm: every booking lands on "confirmed" so only the daily cap
    // (not the separate "one active unpaid booking" cap) is in play here.
    const f = await fx();
    await db
      .update(tenants)
      .set({ bookingRules: { ...f.tenant.bookingRules, maxBookingsPerPhonePerDay: 1 } })
      .where(eq(tenants.id, f.tenant.id));
    const tenant = (await db.query.tenants.findFirst({ where: eq(tenants.id, f.tenant.id) }))!;
    const phone = "09121110000";

    const first = await createBooking(db, {
      tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(9),
      customer: { name: "ادمین", phone },
      source: "telegram",
    });
    expect(first.status).toBe("confirmed");

    await expect(
      createBooking(db, {
        tenant,
        staffId: f.staffId,
        serviceId: f.serviceId,
        startAt: tomorrowAt(9, 30),
        customer: { name: "ادمین", phone },
        source: "telegram",
      }),
    ).rejects.toMatchObject({ code: "DAILY_LIMIT_REACHED" });

    const bypassed = await createBooking(db, {
      tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(10),
      customer: { name: "ادمین", phone },
      source: "telegram",
      skipAbuseLimits: true,
    });
    expect(bypassed.status).toBe("confirmed"); // status logic untouched, only the cap was skipped
  });

  it("auto-confirms without deposit and notifies linked admins via the outbox", async () => {
    const f = await fx();
    const r = await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(11),
      customer: { name: "رضا", phone: "09120000002" },
      source: "web",
    });
    expect(r.status).toBe("confirmed");
    expect(r.depositAmount).toBe(0);
    const rows = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.tenantId, f.tenant.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.channel).toBe("telegram");
    expect(rows[0]!.recipientChatId).toBe("111");
    expect(rows[0]!.kind).toBe("booking_created");
  });

  it("only ONE of many concurrent bookings for the same slot succeeds (DB exclusion constraint)", async () => {
    const f = await fx();
    const start = tomorrowAt(12);
    const attempts = Array.from({ length: 8 }, (_, i) =>
      createBooking(db, {
        tenant: f.tenant,
        staffId: f.staffId,
        serviceId: f.serviceId,
        startAt: start,
        customer: { name: `مشتری${i}`, phone: `0912100000${i}` },
        source: "web",
      })
        .then(() => "ok" as const)
        .catch((e: unknown) => (e instanceof DomainError ? e.code : `unexpected:${String(e)}`)),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "SLOT_TAKEN" || r === "SLOT_UNAVAILABLE")).toHaveLength(7);
    const rows = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, f.tenant.id), eq(bookings.startAt, start)));
    expect(rows).toHaveLength(1);
  });

  it("a second process cannot double-book the same slot", async () => {
    // The queue in write-queue.ts only orders writes inside one process. Production
    // runs two (arayeshgar-web and arayeshgar-bots), so this drives the real engine
    // from a real child process against the same file, racing the parent.
    //
    // The two starts overlap without matching: 16:00-16:30 against 16:15-16:45 for a
    // 30-minute service. bookings_staff_start_uq cannot see that — only BEGIN IMMEDIATE
    // and the overlap check it protects can. So this exercises the half of the
    // guarantee that has no backstop.
    const f = await fx();
    const start = tomorrowAt(16);
    const overlapping = new Date(start.getTime() + 15 * 60_000);
    const worker = fileURLToPath(new URL("./helpers/booking-worker.ts", import.meta.url));

    type Outcome = { ok: boolean; code?: string | null };
    const child = new Promise<Outcome>((resolve, reject) => {
      execFile(
        process.execPath,
        [
          "--import",
          "tsx",
          worker,
          DATABASE_URL,
          f.tenant.id,
          f.staffId,
          f.serviceId,
          overlapping.toISOString(),
          "09121110000",
        ],
        { timeout: 60_000 },
        (err, stdout) => {
          if (err && !stdout) return reject(err);
          const line = stdout.trim().split("\n").pop() ?? "{}";
          resolve(JSON.parse(line) as Outcome);
        },
      );
    });

    const parent = createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: start,
      customer: { name: "مشتری پروسه اول", phone: "09121110001" },
      source: "web",
    })
      .then((): Outcome => ({ ok: true }))
      .catch((e: unknown): Outcome => ({
        ok: false,
        code: e instanceof DomainError ? e.code : String(e),
      }));

    const [a, b] = await Promise.all([parent, child]);
    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);

    // Exactly one booking exists, whichever process got there first.
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(["SLOT_TAKEN", "SLOT_UNAVAILABLE"]).toContain(losers[0]!.code);

    const rows = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, f.tenant.id), eq(bookings.staffId, f.staffId)));
    expect(rows).toHaveLength(1);
  });

  it("'any' staff picks a free barber, then the other, then fails", async () => {
    const f = await fx({ mode: "salon_central" });
    const start = tomorrowAt(13);
    const a = await createBooking(db, {
      tenant: f.tenant,
      staffId: "any",
      serviceId: f.serviceId,
      startAt: start,
      customer: { name: "الف", phone: "09121110001" },
      source: "web",
    });
    const b = await createBooking(db, {
      tenant: f.tenant,
      staffId: "any",
      serviceId: f.serviceId,
      startAt: start,
      customer: { name: "بهرام", phone: "09121110002" },
      source: "web",
    });
    expect(new Set([a.staffId, b.staffId]).size).toBe(2);
    await expect(
      createBooking(db, {
        tenant: f.tenant,
        staffId: "any",
        serviceId: f.serviceId,
        startAt: start,
        customer: { name: "جواد", phone: "09121110003" },
        source: "web",
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  it("deposit flow: pending_payment -> receipt_submitted -> confirmed, with payment snapshot", async () => {
    const f = await fx({ deposit: true });
    const r = await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(14),
      customer: { name: "رضا", phone: "09120000003" },
      source: "web",
    });
    expect(r.status).toBe("pending_payment");
    expect(r.depositAmount).toBe(100000);
    expect(r.expiresAt).not.toBeNull();
    expect(r.payTo?.cardNumber).toBe("6037991234567890");
    const [p] = await db.select().from(payments).where(eq(payments.bookingId, r.bookingId));
    expect(p?.status).toBe("awaiting_receipt");

    // Second unpaid booking for the same phone is blocked
    await expect(
      createBooking(db, {
        tenant: f.tenant,
        staffId: f.staffId,
        serviceId: f.serviceId,
        startAt: tomorrowAt(15),
        customer: { name: "رضا", phone: "09120000003" },
        source: "web",
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_ACTIVE_BOOKINGS" });

    const ctx = await submitReceipt(db, f.tenant.id, r.bookingId, {
      receiptPath: "x/receipt.jpg",
      trackingNo: "123456",
    });
    expect(ctx.booking.status).toBe("receipt_submitted");
    expect(ctx.payment?.status).toBe("submitted");

    // double submit is rejected
    await expect(
      submitReceipt(db, f.tenant.id, r.bookingId, { receiptPath: "y.jpg" }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });

    const ok = await approveReceipt(db, f.tenant.id, r.bookingId, f.ownerId);
    expect(ok.booking.status).toBe("confirmed");
    expect(ok.payment?.status).toBe("approved");
    const kinds = (
      await db
        .select({ k: notificationOutbox.kind })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.tenantId, f.tenant.id))
    ).map((x) => x.k);
    expect(kinds).toContain("receipt_submitted");
  });

  it("rejecting a receipt frees the slot; expiry frees the slot and blocks late receipts", async () => {
    const f = await fx({ deposit: true });
    const start = tomorrowAt(16);
    const r1 = await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: start,
      customer: { name: "الف", phone: "09122220001" },
      source: "web",
    });
    await submitReceipt(db, f.tenant.id, r1.bookingId, { receiptPath: "a.jpg" });
    await rejectReceipt(db, f.tenant.id, r1.bookingId, f.ownerId, "مبلغ اشتباه");
    // slot is free again
    const r2 = await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: start,
      customer: { name: "بهرام", phone: "09122220002" },
      source: "web",
    });
    expect(r2.status).toBe("pending_payment");

    // force the deadline into the past, run the worker job
    await db
      .update(bookings)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(bookings.id, r2.bookingId));
    const n = await expireBookings(db);
    expect(n).toBeGreaterThanOrEqual(1);
    await expect(
      submitReceipt(db, f.tenant.id, r2.bookingId, { receiptPath: "late.jpg" }),
    ).rejects.toMatchObject({ code: "PAYMENT_EXPIRED" });
    await expect(expireBooking(db, f.tenant.id, r2.bookingId)).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });

  it("reschedule keeps code & payment, moves the slot, and rejects a taken target", async () => {
    const f = await fx();
    const a = await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(17),
      customer: { name: "الف", phone: "09123330001" },
      source: "web",
    });
    const b = await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(18),
      customer: { name: "بهرام", phone: "09123330002" },
      source: "web",
    });
    // overlapping move by 15 minutes onto own old interval is fine
    const moved = await rescheduleBooking(db, f.tenant.id, a.bookingId, {
      startAt: tomorrowAt(17, 15),
      userId: f.ownerId,
    });
    expect(moved.booking.code).toBe(a.code);
    expect(moved.booking.startAt.getTime()).toBe(tomorrowAt(17, 15).getTime());
    // moving onto b's slot fails and leaves a untouched
    await expect(
      rescheduleBooking(db, f.tenant.id, a.bookingId, {
        startAt: tomorrowAt(18),
        userId: f.ownerId,
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, a.bookingId));
    expect(row?.status).toBe("confirmed");
    expect(row?.startAt.getTime()).toBe(tomorrowAt(17, 15).getTime());
    void b;
  });

  it("customer cancel respects the cutoff; admin cancel always works", async () => {
    const f = await fx();
    const r = await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(19),
      customer: { name: "الف", phone: "09124440001" },
      source: "web",
    });
    // pretend it's 1 hour before the appointment
    await expect(
      cancelByCustomer(db, f.tenant.id, r.bookingId, new Date(tomorrowAt(18).getTime())),
    ).rejects.toMatchObject({ code: "CANCEL_WINDOW_CLOSED" });
    const c = await cancelByCustomer(db, f.tenant.id, r.bookingId, new Date());
    expect(c.booking.status).toBe("cancelled");
    expect(c.booking.cancelledBy).toBe("customer");

    const r2 = await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(19),
      customer: { name: "بهرام", phone: "09124440002" },
      source: "web",
    });
    const c2 = await cancelByAdmin(db, f.tenant.id, r2.bookingId, f.ownerId, "تعطیلی");
    expect(c2.booking.status).toBe("cancelled");
    expect(c2.booking.cancelReason).toBe("تعطیلی");
  });

  it("outbox drain sends, retries with backoff, and marks sent", async () => {
    const f = await fx();
    await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(20),
      customer: { name: "الف", phone: "09125550001" },
      source: "web",
    });
    const mine = (row: { tenantId: string }) => row.tenantId === f.tenant.id;
    let calls = 0;
    // The outbox is shared with other fixtures running in this file; only assert on our tenant's row.
    await drainOutbox(db, {
      telegram: async (row) => {
        if (!mine(row)) return;
        calls++;
        throw new Error("network down");
      },
    });
    let [row] = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.tenantId, f.tenant.id));
    expect(calls).toBe(1);
    expect(row?.sentAt).toBeNull();
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toContain("network down");
    expect(row!.nextTryAt.getTime()).toBeGreaterThan(Date.now());

    // not due yet -> not picked
    await drainOutbox(db, {
      telegram: async (r) => {
        if (mine(r)) calls++;
      },
    });
    expect(calls).toBe(1);

    await db
      .update(notificationOutbox)
      .set({ nextTryAt: new Date(Date.now() - 1000) })
      .where(eq(notificationOutbox.id, row!.id));
    await drainOutbox(db, {
      telegram: async (r) => {
        if (mine(r)) calls++;
      },
    });
    expect(calls).toBe(2);
    [row] = await db.select().from(notificationOutbox).where(eq(notificationOutbox.id, row!.id));
    expect(row?.sentAt).not.toBeNull();
    expect(row?.attempts).toBe(2);
  });
});
