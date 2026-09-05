/**
 * One permission matrix for the three salon scenarios. No separate code paths:
 * the UI, API and bots all ask `can(user, action, { tenant, staffId })`.
 */
import type { Tenant, User } from "@arayeshgar/db";

export type Action =
  | "view_bookings"
  | "manage_booking" // confirm / cancel / reschedule / complete / no-show
  | "review_receipt"
  | "manage_services"
  | "manage_schedule"
  | "manage_staff"
  | "manage_deposit"
  | "manage_branding"
  | "manage_tenant"; // flags, domain, status: platform only

export type AuthzContext = { tenant: Pick<Tenant, "id" | "mode">; staffId?: string | null };
type Subject = Pick<User, "role" | "tenantId" | "staffId" | "isActive">;

export function can(user: Subject, action: Action, ctx: AuthzContext): boolean {
  if (!user.isActive) return false;
  if (user.role === "platform_admin") return true;
  if (user.tenantId !== ctx.tenant.id) return false;

  const own = ctx.staffId == null || ctx.staffId === user.staffId;

  switch (user.role) {
    case "owner":
      return action !== "manage_tenant";
    case "manager":
      // Central admin: everything operational, not branding/tenant.
      return !["manage_branding", "manage_tenant"].includes(action);
    case "staff":
      if (ctx.tenant.mode !== "salon_independent") {
        // In solo/central, staff logins (if any) are read-only on their own calendar.
        return action === "view_bookings" && own;
      }
      // Independent barber: full control of own calendar, services, deposit card and receipts.
      return (
        own &&
        [
          "view_bookings",
          "manage_booking",
          "review_receipt",
          "manage_services",
          "manage_schedule",
          "manage_deposit",
        ].includes(action)
      );
  }
  return false;
}

/** Staff ids this user may see; null = all staff of the tenant. */
export function visibleStaffIds(
  user: Subject,
  tenant: Pick<Tenant, "id" | "mode">,
): string[] | null {
  if (user.role === "platform_admin" || user.role === "owner" || user.role === "manager")
    return null;
  if (user.role === "staff" && user.tenantId === tenant.id && user.staffId) return [user.staffId];
  return [];
}
