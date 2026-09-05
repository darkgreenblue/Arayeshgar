import Link from "next/link";
import {
  STATUS_LABELS_FA,
  formatJalaliLong,
  formatMinutes,
  toLocal,
  toPersianDigits,
  formatIranMobile,
} from "@arayeshgar/core";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminPage } from "@/lib/admin";
import { bookingsForDay, upcomingCounts } from "@/lib/admin-queries";

export const dynamic = "force-dynamic";

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const ctx = await requireAdminPage();
  const { d } = await searchParams;
  const offset = Math.max(-30, Math.min(30, Number(d ?? 0) || 0));
  const [{ day, rows }, upcoming] = await Promise.all([
    bookingsForDay(ctx, offset),
    upcomingCounts(ctx),
  ]);
  const active = rows.filter(
    (r) => !["cancelled", "rejected", "expired"].includes(r.booking.status),
  );
  return (
    <AdminShell ctx={ctx}>
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/admin?d=${offset - 1}`}
          className="rounded-full border border-black/10 px-3 py-1 text-sm"
        >
          ‹ قبل
        </Link>
        <h1 className="text-center text-lg font-black">
          {formatJalaliLong(day)}
          {offset === 0 && <span className="ms-2 text-xs font-normal opacity-60">(امروز)</span>}
        </h1>
        <Link
          href={`/admin?d=${offset + 1}`}
          className="rounded-full border border-black/10 px-3 py-1 text-sm"
        >
          بعد ›
        </Link>
      </div>
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="opacity-60">هفته آینده: {toPersianDigits(upcoming)} رزرو فعال</span>
        <Link
          href="/admin/bookings/new"
          className="rounded-xl bg-black px-3 py-1.5 font-bold text-white"
        >
          + رزرو جدید
        </Link>
      </div>
      {active.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center opacity-60">رزروی برای این روز نیست.</p>
      ) : (
        <ul className="space-y-2">
          {active.map(({ booking: b, customer: c, service: s, staff: st }) => {
            const l = toLocal(b.startAt, ctx.tenant.timezone);
            return (
              <li key={b.id}>
                <Link
                  href={`/admin/bookings/${b.id}`}
                  className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm transition hover:shadow"
                >
                  <div className="fa-nums w-14 text-center text-lg font-black">
                    {formatMinutes(l.hh * 60 + l.mm)}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold">
                      {c.name}{" "}
                      <span className="fa-nums text-xs opacity-60" dir="ltr">
                        {formatIranMobile(c.phone)}
                      </span>
                    </div>
                    <div className="text-sm opacity-70">
                      {s.name}
                      {ctx.tenant.mode !== "solo" ? ` · ${st.name}` : ""} ·{" "}
                      {toPersianDigits(s.durationMin)}′
                    </div>
                  </div>
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">
                    {STATUS_LABELS_FA[b.status]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
