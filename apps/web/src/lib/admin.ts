import "server-only";
import { redirect } from "next/navigation";
import type { Tenant, User } from "@arayeshgar/db";
import { can, Errors, type Action } from "@arayeshgar/core";
import { currentUser } from "./session";
import { currentTenant } from "./tenant";

export type AdminCtx = { tenant: Tenant; user: User };

/** For pages: redirect to login when not authenticated. */
export async function requireAdminPage(): Promise<AdminCtx> {
  const r = await currentTenant();
  if (!r.tenant) redirect("/");
  const user = await currentUser(r.tenant.id);
  if (!user) redirect("/admin/login");
  return { tenant: r.tenant, user };
}

/** For API routes: throw FORBIDDEN (rendered as 403 JSON). */
export async function requireAdminApi(action?: Action, staffId?: string | null): Promise<AdminCtx> {
  const r = await currentTenant();
  if (!r.tenant) throw Errors.notFound("آرایشگر");
  const user = await currentUser(r.tenant.id);
  if (!user) throw Errors.forbidden();
  if (action && !can(user, action, { tenant: r.tenant, staffId })) throw Errors.forbidden();
  return { tenant: r.tenant, user };
}
