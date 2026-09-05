import type { ReactNode } from "react";
import { can } from "@arayeshgar/core";
import type { AdminCtx } from "@/lib/admin";
import { pendingReviewCount } from "@/lib/admin-queries";
import { AdminNav } from "./AdminNav";

/** Server wrapper: nav items depend on role/mode; badge on receipts. */
export async function AdminShell({ ctx, children }: { ctx: AdminCtx; children: ReactNode }) {
  const pending = await pendingReviewCount(ctx);
  const t = { tenant: ctx.tenant };
  const items = [
    { href: "/admin", label: "امروز" },
    { href: "/admin/receipts", label: "رسیدها" },
    { href: "/admin/bookings", label: "رزروها" },
    ...(can(ctx.user, "manage_services", t) ? [{ href: "/admin/services", label: "خدمات" }] : []),
    ...(can(ctx.user, "manage_schedule", t)
      ? [{ href: "/admin/schedule", label: "ساعت کاری" }]
      : []),
    ...(ctx.tenant.mode !== "solo" && can(ctx.user, "manage_staff", t)
      ? [{ href: "/admin/staff", label: "آرایشگرها" }]
      : []),
    { href: "/admin/customers", label: "مشتری‌ها" },
    { href: "/admin/settings", label: "تنظیمات" },
  ];
  return (
    <>
      <AdminNav name={ctx.tenant.branding.displayName} pending={pending} items={items} />
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
    </>
  );
}
