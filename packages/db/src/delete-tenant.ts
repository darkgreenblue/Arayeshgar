import { eq, inArray } from "drizzle-orm";
import type { Db, Tx } from "./client";
import {
  auditLog,
  bookings,
  botBindings,
  botSessions,
  customerIdentities,
  customers,
  manualSlots,
  notificationOutbox,
  payments,
  scheduleOverrides,
  schedules,
  services,
  staff,
  staffServices,
  tenants,
  users,
} from "./schema";

/**
 * Removes a tenant and everything belonging to it.
 *
 * The schema declares ON DELETE CASCADE, and under Postgres that was enough. SQLite
 * only honours foreign keys when `PRAGMA foreign_keys` is ON, and that pragma is
 * per-connection while the client keeps a pool it opens connections in on demand —
 * so a plain `DELETE FROM tenants` would succeed and quietly strand every child row.
 * Deleting explicitly, child-first, inside one transaction is the honest version:
 * it does not depend on a setting we cannot guarantee, and it either all happens or
 * none of it does.
 *
 * Adding a table with a tenant_id means adding it here too.
 */
export async function deleteTenant(db: Db, tenantId: string): Promise<void> {
  await db.transaction(async (tx) => deleteTenantIn(tx, tenantId));
}

/** The same deletion, for callers already inside a transaction. */
export async function deleteTenantIn(tx: Tx, tenantId: string): Promise<void> {
  const staffIds = (
    await tx.select({ id: staff.id }).from(staff).where(eq(staff.tenantId, tenantId))
  ).map((r) => r.id);
  const serviceIds = (
    await tx.select({ id: services.id }).from(services).where(eq(services.tenantId, tenantId))
  ).map((r) => r.id);

  // Children first, so nothing is ever orphaned even if this is interrupted.
  await tx.delete(payments).where(eq(payments.tenantId, tenantId));
  await tx.delete(bookings).where(eq(bookings.tenantId, tenantId));
  await tx.delete(customerIdentities).where(eq(customerIdentities.tenantId, tenantId));
  await tx.delete(customers).where(eq(customers.tenantId, tenantId));
  await tx.delete(schedules).where(eq(schedules.tenantId, tenantId));
  await tx.delete(scheduleOverrides).where(eq(scheduleOverrides.tenantId, tenantId));
  await tx.delete(manualSlots).where(eq(manualSlots.tenantId, tenantId));
  await tx.delete(notificationOutbox).where(eq(notificationOutbox.tenantId, tenantId));
  await tx.delete(botSessions).where(eq(botSessions.tenantId, tenantId));
  await tx.delete(botBindings).where(eq(botBindings.tenantId, tenantId));
  await tx.delete(auditLog).where(eq(auditLog.tenantId, tenantId));

  // staff_services has no tenant_id of its own; it hangs off staff and services.
  if (staffIds.length)
    await tx.delete(staffServices).where(inArray(staffServices.staffId, staffIds));
  if (serviceIds.length) {
    await tx.delete(staffServices).where(inArray(staffServices.serviceId, serviceIds));
  }

  await tx.delete(users).where(eq(users.tenantId, tenantId)); // users reference staff
  await tx.delete(services).where(eq(services.tenantId, tenantId));
  await tx.delete(staff).where(eq(staff.tenantId, tenantId));
  await tx.delete(tenants).where(eq(tenants.id, tenantId));
}
