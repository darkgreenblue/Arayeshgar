import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { bookings, customers, services, staff, type Db } from "@arayeshgar/db";
import { Errors } from "../errors/domain";
import { normalizeIranMobile, toEnglishDigits } from "../utils/phone";

export async function searchCustomers(db: Db, tenantId: string, q: string, limit = 50) {
  const term = q.trim();
  const phone = normalizeIranMobile(term);
  const where = term
    ? and(
        eq(customers.tenantId, tenantId),
        or(
          ilike(customers.name, `%${term}%`),
          ilike(customers.phone, `%${toEnglishDigits(term).replace(/\D/g, "")}%`),
          phone ? eq(customers.phone, phone) : sql`false`,
        ),
      )
    : eq(customers.tenantId, tenantId);
  const rows = await db
    .select({
      customer: customers,
      total: sql<number>`count(${bookings.id})`,
      noShows: sql<number>`count(${bookings.id}) filter (where ${bookings.status} = 'no_show')`,
      last: sql<Date | null>`max(${bookings.startAt})`,
    })
    .from(customers)
    .leftJoin(bookings, eq(bookings.customerId, customers.id))
    .where(where)
    .groupBy(customers.id)
    .orderBy(desc(sql`max(${bookings.startAt})`), desc(customers.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r.customer,
    total: Number(r.total),
    noShows: Number(r.noShows),
    last: r.last ? new Date(r.last) : null,
  }));
}

export async function customerHistory(db: Db, tenantId: string, customerId: string) {
  const c = await db.query.customers.findFirst({
    where: and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)),
  });
  if (!c) throw Errors.notFound("مشتری");
  const history = await db
    .select({ booking: bookings, service: services, staff })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .where(eq(bookings.customerId, customerId))
    .orderBy(desc(bookings.startAt))
    .limit(100);
  return { customer: c, history };
}

export async function setCustomerBlocked(
  db: Db,
  tenantId: string,
  customerId: string,
  blocked: boolean,
) {
  const [row] = await db
    .update(customers)
    .set({ blocked })
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .returning();
  if (!row) throw Errors.notFound("مشتری");
}
export async function setCustomerNotes(
  db: Db,
  tenantId: string,
  customerId: string,
  notes: string,
) {
  await db
    .update(customers)
    .set({ notes: notes.slice(0, 1000) })
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)));
}
export async function customerCount(db: Db, tenantId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(customers)
    .where(eq(customers.tenantId, tenantId));
  return Number(r?.n ?? 0);
}
