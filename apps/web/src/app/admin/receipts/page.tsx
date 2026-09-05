import Link from "next/link";
import { formatInstantFa, formatIranMobile, formatToman, toPersianDigits } from "@arayeshgar/core";
import { AdminShell } from "@/components/admin/AdminShell";
import { ReceiptActions } from "@/components/admin/ReceiptActions";
import { requireAdminPage } from "@/lib/admin";
import { reviewQueue } from "@/lib/admin-queries";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const ctx = await requireAdminPage();
  const queue = await reviewQueue(ctx);
  return (
    <AdminShell ctx={ctx}>
      <h1 className="mb-4 text-lg font-black">در انتظار تأیید</h1>
      {queue.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center opacity-60">همه‌چیز بررسی شده است ✅</p>
      ) : (
        <ul className="space-y-3">
          {queue.map(({ booking: b, customer: c, service: s, staff: st, payment: p }) => (
            <li key={b.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/admin/bookings/${b.id}`} className="font-bold hover:underline">
                    {c.name}{" "}
                    <span className="fa-nums text-xs opacity-60" dir="ltr">
                      {formatIranMobile(c.phone)}
                    </span>
                  </Link>
                  <div className="text-sm opacity-70">
                    {s.name}
                    {ctx.tenant.mode !== "solo" ? ` · ${st.name}` : ""}
                  </div>
                  <div className="fa-nums text-sm">
                    {formatInstantFa(b.startAt, ctx.tenant.timezone)}
                  </div>
                  <div className="fa-nums mt-1 text-xs opacity-60" dir="ltr">
                    {b.code}
                  </div>
                </div>
                {b.status === "receipt_submitted" && p && (
                  <div className="text-end text-sm">
                    <div className="fa-nums font-bold">{formatToman(p.amount)}</div>
                    {p.trackingNo && (
                      <div className="fa-nums text-xs opacity-60">
                        پیگیری: {toPersianDigits(p.trackingNo)}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {b.status === "receipt_submitted" && p?.receiptPath && (
                <a
                  href={`/api/admin/receipt/${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block"
                >
                  <img
                    src={`/api/admin/receipt/${p.id}`}
                    alt="رسید"
                    className="max-h-72 w-full rounded-xl bg-black/5 object-contain"
                  />
                </a>
              )}
              {b.status === "pending_approval" && (
                <p className="mt-2 text-xs opacity-60">بدون بیعانه؛ منتظر تأیید شما.</p>
              )}
              <div className="mt-3">
                <ReceiptActions
                  bookingId={b.id}
                  mode={b.status === "receipt_submitted" ? "receipt" : "approval"}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
