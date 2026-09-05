import Link from "next/link";
import {
  formatIranMobile,
  formatInstantFa,
  searchCustomers,
  toPersianDigits,
} from "@arayeshgar/core";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdminPage } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await requireAdminPage();
  const { q = "" } = await searchParams;
  const rows = await searchCustomers(db(), ctx.tenant.id, q);
  return (
    <AdminShell ctx={ctx}>
      <h1 className="mb-4 text-lg font-black">مشتری‌ها</h1>
      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="جستجو با نام یا شماره"
          className="flex-1 rounded-xl border border-black/15 bg-white p-2.5 text-sm"
        />
        <button className="rounded-xl bg-black px-4 text-sm font-bold text-white">جستجو</button>
      </form>
      <ul className="space-y-2">
        {rows.length === 0 && (
          <li className="rounded-2xl bg-white p-6 text-center opacity-60">موردی پیدا نشد.</li>
        )}
        {rows.map((c) => (
          <li key={c.id}>
            <Link
              href={`/admin/customers/${c.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3 text-sm shadow-sm"
            >
              <div>
                <div className="font-bold">
                  {c.name}
                  {c.blocked && (
                    <span className="ms-2 rounded-full bg-red-100 px-2 text-xs text-red-700">
                      مسدود
                    </span>
                  )}
                </div>
                <div className="fa-nums opacity-60" dir="ltr">
                  {formatIranMobile(c.phone)}
                </div>
              </div>
              <div className="text-end text-xs opacity-70">
                <div className="fa-nums">
                  {toPersianDigits(c.total)} رزرو
                  {c.noShows > 0 ? ` · ${toPersianDigits(c.noShows)} غیبت` : ""}
                </div>
                {c.last && (
                  <div className="fa-nums">
                    آخرین: {formatInstantFa(c.last, ctx.tenant.timezone).split("، ")[0]}
                  </div>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
