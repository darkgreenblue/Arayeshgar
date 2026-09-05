import Link from "next/link";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { bookings, customers, services, staff } from "@arayeshgar/db";
import { STATUS_LABELS_FA, formatInstantFa, visibleStaffIds } from "@arayeshgar/core";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminPage } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function BookingsList({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const ctx = await requireAdminPage();
  const { s: filter = "upcoming" } = await searchParams;
  const ids = visibleStaffIds(ctx.user, ctx.tenant);
  const statusFilter =
    filter === "cancelled"
      ? inArray(bookings.status, ["cancelled", "rejected", "expired", "no_show"])
      : filter === "done"
        ? eq(bookings.status, "completed")
        : inArray(bookings.status, [
            "confirmed",
            "pending_payment",
            "receipt_submitted",
            "pending_approval",
          ]);
  const rows = await db()
    .select({ booking: bookings, customer: customers, service: services, staff })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .where(
      and(
        eq(bookings.tenantId, ctx.tenant.id),
        statusFilter,
        filter === "upcoming" ? gte(bookings.startAt, new Date(Date.now() - 3_600_000)) : undefined,
        ids
          ? inArray(bookings.staffId, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
          : undefined,
      ),
    )
    .orderBy(filter === "upcoming" ? bookings.startAt : desc(bookings.startAt))
    .limit(200);
  const tabs = [
    ["upcoming", "پیش رو"],
    ["done", "انجام‌شده"],
    ["cancelled", "لغو/رد"],
  ] as const;
  return (
    <AdminShell ctx={ctx}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1 text-sm">
          {tabs.map(([k, l]) => (
            <Link
              key={k}
              href={`/admin/bookings?s=${k}`}
              className={`rounded-full px-3 py-1 ${filter === k ? "bg-black text-white" : "bg-white"}`}
            >
              {l}
            </Link>
          ))}
        </div>
        <Link
          href="/admin/bookings/new"
          className="rounded-xl bg-black px-3 py-1.5 text-sm font-bold text-white"
        >
          + رزرو جدید
        </Link>
      </div>
      <ul className="space-y-2">
        {rows.length === 0 && (
          <li className="rounded-2xl bg-white p-6 text-center opacity-60">موردی نیست.</li>
        )}
        {rows.map(({ booking: b, customer: c, service: s, staff: st }) => (
          <li key={b.id}>
            <Link
              href={`/admin/bookings/${b.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3 text-sm shadow-sm"
            >
              <div>
                <div className="font-bold">{c.name}</div>
                <div className="fa-nums opacity-70">
                  {formatInstantFa(b.startAt, ctx.tenant.timezone)} · {s.name}
                  {ctx.tenant.mode !== "solo" ? ` · ${st.name}` : ""}
                </div>
              </div>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">
                {STATUS_LABELS_FA[b.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
