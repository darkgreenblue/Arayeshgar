import Link from "next/link";
import {
  platformListTenants,
  platformStats,
  toPersianDigits,
  formatInstantFa,
} from "@arayeshgar/core";
import { db } from "@/lib/db";
import { requirePlatformPage } from "@/lib/platform";

export const dynamic = "force-dynamic";

const STATUS_FA: Record<string, string> = { demo: "دمو", active: "فعال", suspended: "معلق" };
const STATUS_TONE: Record<string, string> = {
  demo: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-neutral-200",
};

export default async function PlatformHome() {
  await requirePlatformPage();
  const [rows, stats] = await Promise.all([platformListTenants(db()), platformStats(db())]);
  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-black">پنل پلتفرم</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/platform/admins"
            className="rounded-xl border border-black/15 px-4 py-2 text-sm font-bold"
          >
            ادمین‌ها
          </Link>
          <Link
            href="/platform/new"
            className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white"
          >
            + مشتری جدید
          </Link>
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="کل مشتری‌ها" value={stats.tenants} />
        <Stat label="فعال" value={stats.activeTenants} />
        <Stat label="رزرو ۳۰ روز" value={stats.bookings30d} />
        <Stat label="نوتیف در صف" value={stats.pendingNotifications} />
      </div>
      <ul className="space-y-2">
        {rows.length === 0 && (
          <li className="rounded-2xl bg-white p-8 text-center opacity-60">
            هنوز مشتری‌ای ندارید. با «مشتری جدید» شروع کنید.
          </li>
        )}
        {rows.map((t) => (
          <li key={t.id}>
            <Link
              href={`/platform/${t.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm"
            >
              <div>
                <div className="flex items-center gap-2 font-bold">
                  {t.branding.displayName}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[t.status]}`}>
                    {STATUS_FA[t.status]}
                  </span>
                </div>
                <div className="text-xs opacity-60" dir="ltr">
                  {t.customDomain ?? `${t.slug}.*`}
                </div>
              </div>
              <div className="text-end text-xs opacity-70">
                <div className="fa-nums">
                  {toPersianDigits(t.upcoming)} نوبت پیش رو · {toPersianDigits(t.bookings30d)} رزرو
                  در ۳۰ روز
                </div>
                <div className="fa-nums">ساخت: {formatInstantFa(t.createdAt).split("، ")[0]}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
      <div className="fa-nums text-2xl font-black">{toPersianDigits(value)}</div>
      <div className="text-xs opacity-60">{label}</div>
    </div>
  );
}
