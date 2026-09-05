/**
 * Every status change is a conditional UPDATE (`WHERE status = <expected>`); zero rows means the
 * state moved under us and we raise INVALID_TRANSITION instead of silently overwriting.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Booking, BookingStatus, Db, Platform, Tenant } from "@arayeshgar/db";
import {
  auditLog,
  bookings,
  customerIdentities,
  customers,
  payments,
  services,
  staff,
  tenants,
} from "@arayeshgar/db";
import { isSlotBookable, resolveServiceForStaff } from "../availability/availability";
import { Errors, pgErrorCode } from "../errors/domain";
import { getEnv, tenantPublicUrl } from "../env";
import { isEnabled } from "../features/registry";
import { logger } from "../logger";
import { adminRecipients, customerRecipient, enqueue } from "../notifications/enqueue";
import type { NotificationKind } from "../notifications/events";
import { effectiveRules } from "../tenant/config";
import { toPayload, type BookingContext } from "./payload";
import { canTransition } from "./status";

type Actor = { type: "user"; id: string } | { type: "customer"; id: string } | { type: "system" };

export async function loadBookingContext(
  db: Db,
  tenantId: string,
  bookingId: string,
): Promise<BookingContext | null> {
  const rows = await db
    .select({ tenant: tenants, booking: bookings, customer: customers, service: services, staff })
    .from(bookings)
    .innerJoin(tenants, eq(tenants.id, bookings.tenantId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .where(and(eq(bookings.id, bookingId), eq(bookings.tenantId, tenantId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.bookingId, bookingId))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  let identityChatId: string | null = null;
  if (r.booking.source === "telegram" || r.booking.source === "bale") {
    const [idn] = await db
      .select({ uid: customerIdentities.platformUserId })
      .from(customerIdentities)
      .where(
        and(
          eq(customerIdentities.customerId, r.customer.id),
          eq(customerIdentities.platform, r.booking.source as Platform),
        ),
      )
      .limit(1);
    identityChatId = idn?.uid ?? null;
  }
  return { ...r, payment: payment ?? null, identityChatId };
}

export async function findBookingByCode(
  db: Db,
  tenantId: string,
  code: string,
): Promise<BookingContext | null> {
  const [b] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.code, code)))
    .limit(1);
  return b ? loadBookingContext(db, tenantId, b.id) : null;
}

async function transition(
  db: Db,
  tenantId: string,
  bookingId: string,
  from: BookingStatus | BookingStatus[],
  to: BookingStatus,
  extra: Partial<typeof bookings.$inferInsert> = {},
): Promise<Booking> {
  const fromList = Array.isArray(from) ? from : [from];
  for (const f of fromList) if (!canTransition(f, to)) throw Errors.invalidTransition(f, to);
  const [row] = await db
    .update(bookings)
    .set({ status: to, updatedAt: new Date(), ...extra })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.tenantId, tenantId),
        inArray(bookings.status, fromList),
      ),
    )
    .returning();
  if (!row) {
    const [cur] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, bookingId));
    if (!cur) throw Errors.bookingNotFound();
    if (to === "receipt_submitted" && cur.status === "expired") throw Errors.paymentExpired();
    throw Errors.invalidTransition(cur.status, to);
  }
  return row;
}

async function audit(
  db: Db,
  tenantId: string,
  actor: Actor,
  action: string,
  bookingId: string,
  data?: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    tenantId,
    actorType: actor.type,
    actorId: actor.type === "system" ? null : actor.id,
    action,
    entity: "booking",
    entityId: bookingId,
    data,
  });
}

async function notify(
  db: Db,
  ctx: BookingContext,
  kind: NotificationKind,
  to: "admin" | "customer" | "both",
  extra: Record<string, unknown> = {},
) {
  const siteUrl = tenantPublicUrl(getEnv(), ctx.tenant);
  if (to === "admin" || to === "both") {
    await enqueue(
      db,
      ctx.tenant.id,
      kind,
      await adminRecipients(db, ctx.tenant, ctx.booking.staffId),
      toPayload(ctx, "admin", siteUrl, extra),
    );
  }
  if (to === "customer" || to === "both") {
    const rec = customerRecipient(ctx.booking, ctx.identityChatId);
    if (rec)
      await enqueue(db, ctx.tenant.id, kind, [rec], toPayload(ctx, "customer", siteUrl, extra));
  }
}

async function ctxOrThrow(db: Db, tenantId: string, bookingId: string): Promise<BookingContext> {
  const ctx = await loadBookingContext(db, tenantId, bookingId);
  if (!ctx) throw Errors.bookingNotFound();
  return ctx;
}

// ---------------------------------------------------------------------------
// Customer-side
// ---------------------------------------------------------------------------

/** Customer uploaded the receipt: pending_payment -> receipt_submitted; admins get approve/reject buttons. */
export async function submitReceipt(
  db: Db,
  tenantId: string,
  bookingId: string,
  input: { receiptPath: string; trackingNo?: string },
): Promise<BookingContext> {
  await transition(db, tenantId, bookingId, "pending_payment", "receipt_submitted", {
    expiresAt: null,
  });
  await db
    .update(payments)
    .set({
      status: "submitted",
      receiptPath: input.receiptPath,
      trackingNo: input.trackingNo?.slice(0, 40),
      submittedAt: new Date(),
    })
    .where(and(eq(payments.bookingId, bookingId), eq(payments.status, "awaiting_receipt")));
  const ctx = await ctxOrThrow(db, tenantId, bookingId);
  await audit(
    db,
    tenantId,
    { type: "customer", id: ctx.customer.id },
    "receipt_submitted",
    bookingId,
    { trackingNo: input.trackingNo },
  );
  await notify(db, ctx, "receipt_submitted", "admin");
  logger.info({ tenantId, bookingId }, "receipt submitted");
  return ctx;
}

/** Customer cancels (feature customer_cancel, respecting cancelBeforeHours). */
export async function cancelByCustomer(
  db: Db,
  tenantId: string,
  bookingId: string,
  now = new Date(),
): Promise<BookingContext> {
  const ctx = await ctxOrThrow(db, tenantId, bookingId);
  if (!isEnabled(ctx.tenant, "customer_cancel")) throw Errors.forbidden();
  const hours = effectiveRules(ctx.tenant).cancelBeforeHours;
  if (ctx.booking.startAt.getTime() - now.getTime() < hours * 3_600_000)
    throw Errors.cancelWindowClosed(hours);
  await transition(
    db,
    tenantId,
    bookingId,
    ["pending_payment", "receipt_submitted", "pending_approval", "confirmed"],
    "cancelled",
    {
      cancelledBy: "customer",
      expiresAt: null,
    },
  );
  const after = await ctxOrThrow(db, tenantId, bookingId);
  await audit(db, tenantId, { type: "customer", id: ctx.customer.id }, "cancelled", bookingId);
  await notify(db, after, "booking_cancelled", "admin", { reason: "لغو توسط مشتری" });
  return after;
}

// ---------------------------------------------------------------------------
// Admin-side
// ---------------------------------------------------------------------------

export async function approveReceipt(
  db: Db,
  tenantId: string,
  bookingId: string,
  userId: string,
): Promise<BookingContext> {
  await transition(db, tenantId, bookingId, "receipt_submitted", "confirmed");
  await db
    .update(payments)
    .set({ status: "approved", reviewedBy: userId, reviewedAt: new Date() })
    .where(and(eq(payments.bookingId, bookingId), eq(payments.status, "submitted")));
  const ctx = await ctxOrThrow(db, tenantId, bookingId);
  await audit(db, tenantId, { type: "user", id: userId }, "receipt_approved", bookingId);
  await notify(db, ctx, "booking_confirmed", "customer");
  return ctx;
}

export async function rejectReceipt(
  db: Db,
  tenantId: string,
  bookingId: string,
  userId: string,
  reason?: string,
): Promise<BookingContext> {
  await transition(db, tenantId, bookingId, ["receipt_submitted", "pending_approval"], "rejected", {
    cancelledBy: userId,
    cancelReason: reason?.slice(0, 300),
  });
  await db
    .update(payments)
    .set({
      status: "rejected",
      reviewedBy: userId,
      reviewedAt: new Date(),
      rejectReason: reason?.slice(0, 300),
    })
    .where(
      and(
        eq(payments.bookingId, bookingId),
        inArray(payments.status, ["submitted", "awaiting_receipt"]),
      ),
    );
  const ctx = await ctxOrThrow(db, tenantId, bookingId);
  await audit(db, tenantId, { type: "user", id: userId }, "receipt_rejected", bookingId, {
    reason,
  });
  await notify(db, ctx, "booking_rejected", "customer", { reason });
  return ctx;
}

/** Deposit disabled + manual approval: pending_approval -> confirmed. */
export async function confirmBooking(
  db: Db,
  tenantId: string,
  bookingId: string,
  userId: string,
): Promise<BookingContext> {
  await transition(db, tenantId, bookingId, "pending_approval", "confirmed");
  const ctx = await ctxOrThrow(db, tenantId, bookingId);
  await audit(db, tenantId, { type: "user", id: userId }, "confirmed", bookingId);
  await notify(db, ctx, "booking_confirmed", "customer");
  return ctx;
}

export async function cancelByAdmin(
  db: Db,
  tenantId: string,
  bookingId: string,
  userId: string,
  reason?: string,
): Promise<BookingContext> {
  await transition(
    db,
    tenantId,
    bookingId,
    ["pending_payment", "receipt_submitted", "pending_approval", "confirmed"],
    "cancelled",
    {
      cancelledBy: userId,
      cancelReason: reason?.slice(0, 300),
      expiresAt: null,
    },
  );
  const ctx = await ctxOrThrow(db, tenantId, bookingId);
  await audit(db, tenantId, { type: "user", id: userId }, "cancelled", bookingId, { reason });
  await notify(db, ctx, "booking_cancelled", "customer", { reason });
  return ctx;
}

export async function markCompleted(
  db: Db,
  tenantId: string,
  bookingId: string,
  userId: string,
): Promise<Booking> {
  const b = await transition(db, tenantId, bookingId, "confirmed", "completed");
  await audit(db, tenantId, { type: "user", id: userId }, "completed", bookingId);
  return b;
}

export async function markNoShow(
  db: Db,
  tenantId: string,
  bookingId: string,
  userId: string,
): Promise<Booking> {
  const b = await transition(db, tenantId, bookingId, "confirmed", "no_show");
  await audit(db, tenantId, { type: "user", id: userId }, "no_show", bookingId);
  return b;
}

/**
 * Reschedule = UPDATE the same row (payment and code stay attached). Runs in a transaction:
 * validity check against availability, then the DB EXCLUDE constraint settles races.
 */
export async function rescheduleBooking(
  db: Db,
  tenantId: string,
  bookingId: string,
  input: { startAt: Date; staffId?: string; userId: string; now?: Date },
): Promise<BookingContext> {
  const ctx = await ctxOrThrow(db, tenantId, bookingId);
  if (
    !(
      ["pending_payment", "receipt_submitted", "pending_approval", "confirmed"] as BookingStatus[]
    ).includes(ctx.booking.status)
  ) {
    throw Errors.invalidTransition(ctx.booking.status, ctx.booking.status);
  }
  const staffId = input.staffId ?? ctx.booking.staffId;
  const svc = await resolveServiceForStaff(db, staffId, ctx.booking.serviceId);
  if (!svc) throw Errors.slotUnavailable();
  const endAt = new Date(input.startAt.getTime() + svc.durationMin * 60_000);
  const now = input.now ?? new Date();

  try {
    await db.transaction(async (tx) => {
      // Temporarily park this booking so its own old interval does not block the check/insert.
      await tx.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, bookingId));
      const ok = await isSlotBookable(tx, ctx.tenant, staffId, svc.durationMin, input.startAt, now);
      if (!ok) throw Errors.slotUnavailable();
      await tx
        .update(bookings)
        .set({
          status: ctx.booking.status,
          staffId,
          startAt: input.startAt,
          endAt,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId));
    });
  } catch (err) {
    if (pgErrorCode(err) === "23P01") throw Errors.slotTaken();
    throw err;
  }
  const after = await ctxOrThrow(db, tenantId, bookingId);
  await audit(db, tenantId, { type: "user", id: input.userId }, "rescheduled", bookingId, {
    from: ctx.booking.startAt.toISOString(),
    to: input.startAt.toISOString(),
    fromStaff: ctx.booking.staffId,
    toStaff: staffId,
  });
  await notify(db, after, "booking_rescheduled", "customer", {
    previousStartAt: ctx.booking.startAt.toISOString(),
  });
  return after;
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export async function expireBooking(db: Db, tenantId: string, bookingId: string): Promise<void> {
  await transition(db, tenantId, bookingId, "pending_payment", "expired", {
    cancelledBy: "system",
    cancelReason: "payment deadline passed",
  });
  await db
    .update(payments)
    .set({ status: "rejected", rejectReason: "expired" })
    .where(and(eq(payments.bookingId, bookingId), eq(payments.status, "awaiting_receipt")));
  const ctx = await loadBookingContext(db, tenantId, bookingId);
  if (!ctx) return;
  await audit(db, tenantId, { type: "system" }, "expired", bookingId);
  await notify(db, ctx, "booking_expired", "customer");
}

/** Admin creates a booking on behalf of a walk-in / phone customer (already confirmed). */
export type { Tenant };
