import "server-only";
import { and, asc, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { bookings, customers, payments, services, staff } from "@arayeshgar/db";
import { addDays, localDateOf, localToInstant, visibleStaffIds } from "@arayeshgar/core";
import type { AdminCtx } from "./admin";
import { db } from "./db";

function staffScope(ctx: AdminCtx) {
  const ids = visibleStaffIds(ctx.user, ctx.tenant);
  return ids === null
    ? undefined
    : inArray(bookings.staffId, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
}

export async function pendingReviewCount(ctx: AdminCtx): Promise<number> {
  const [r] = await db()
    .select({ n: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, ctx.tenant.id),
        inArray(bookings.status, ["receipt_submitted", "pending_approval"]),
        staffScope(ctx),
      ),
    );
  return Number(r?.n ?? 0);
}

export async function reviewQueue(ctx: AdminCtx) {
  return db()
    .select({ booking: bookings, customer: customers, service: services, staff, payment: payments })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .leftJoin(payments, eq(payments.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.tenantId, ctx.tenant.id),
        inArray(bookings.status, ["receipt_submitted", "pending_approval"]),
        staffScope(ctx),
      ),
    )
    .orderBy(desc(bookings.updatedAt));
}

export async function bookingsForDay(ctx: AdminCtx, dayOffset = 0) {
  const tz = ctx.tenant.timezone;
  const day = addDays(localDateOf(new Date(), tz), dayOffset);
  const from = localToInstant(day, 0, tz);
  const to = localToInstant(addDays(day, 1), 0, tz);
  const rows = await db()
    .select({ booking: bookings, customer: customers, service: services, staff })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .where(
      and(
        eq(bookings.tenantId, ctx.tenant.id),
        gte(bookings.startAt, from),
        lt(bookings.startAt, to),
        staffScope(ctx),
      ),
    )
    .orderBy(asc(bookings.startAt));
  return { day, rows };
}

export async function bookingDetail(ctx: AdminCtx, id: string) {
  const rows = await db()
    .select({ booking: bookings, customer: customers, service: services, staff, payment: payments })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .leftJoin(payments, eq(payments.bookingId, bookings.id))
    .where(and(eq(bookings.id, id), eq(bookings.tenantId, ctx.tenant.id), staffScope(ctx)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upcomingCounts(ctx: AdminCtx) {
  const tz = ctx.tenant.timezone;
  const today = localDateOf(new Date(), tz);
  const from = localToInstant(today, 0, tz);
  const to = localToInstant(addDays(today, 7), 0, tz);
  const [r] = await db()
    .select({ n: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, ctx.tenant.id),
        gte(bookings.startAt, from),
        lt(bookings.startAt, to),
        inArray(bookings.status, [
          "confirmed",
          "pending_payment",
          "receipt_submitted",
          "pending_approval",
        ]),
        staffScope(ctx),
      ),
    );
  return Number(r?.n ?? 0);
}
