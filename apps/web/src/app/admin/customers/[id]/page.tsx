import Link from "next/link";
import { notFound } from "next/navigation";
import {
  customerHistory,
  formatInstantFa,
  formatIranMobile,
  STATUS_LABELS_FA,
} from "@arayeshgar/core";
import { AdminShell } from "@/components/admin/AdminShell";
import { CustomerActions } from "@/components/admin/CustomerActions";
import { requireAdminPage } from "@/lib/admin";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminPage();
  const { id } = await params;
  const data = await customerHistory(db(), ctx.tenant.id, id).catch(() => null);
  if (!data) notFound();
  const { customer: c, history } = data;
  return (
    <AdminShell ctx={ctx}>
      <div className="mb-3">
        <h1 className="text-lg font-black">{c.name}</h1>
        <a href={`tel:${c.phone}`} className="fa-nums text-sm opacity-70" dir="ltr">
          {formatIranMobile(c.phone)}
        </a>
      </div>
      <CustomerActions id={c.id} blocked={c.blocked} notes={c.notes ?? ""} />
      <h2 className="mb-2 mt-5 font-black">تاریخچه</h2>
      <ul className="space-y-2">
        {history.length === 0 && (
          <li className="rounded-2xl bg-white p-6 text-center opacity-60">رزروی ندارد.</li>
        )}
        {history.map(({ booking: b, service: s, staff: st }) => (
          <li key={b.id}>
            <Link
              href={`/admin/bookings/${b.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3 text-sm shadow-sm"
            >
              <span className="fa-nums">
                {formatInstantFa(b.startAt, ctx.tenant.timezone)} · {s.name}
                {ctx.tenant.mode !== "solo" ? ` · ${st.name}` : ""}
              </span>
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
