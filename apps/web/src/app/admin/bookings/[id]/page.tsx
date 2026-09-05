import Link from "next/link";
import { notFound } from "next/navigation";
import {
  STATUS_LABELS_FA,
  formatInstantFa,
  formatIranMobile,
  formatToman,
  toPersianDigits,
} from "@arayeshgar/core";
import { AdminShell } from "@/components/admin/AdminShell";
import { BookingActions } from "@/components/admin/BookingActions";
import { ReceiptActions } from "@/components/admin/ReceiptActions";
import { requireAdminPage } from "@/lib/admin";
import { bookingDetail } from "@/lib/admin-queries";

export const dynamic = "force-dynamic";

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminPage();
  const { id } = await params;
  const r = await bookingDetail(ctx, id);
  if (!r) notFound();
  const { booking: b, customer: c, service: s, staff: st, payment: p } = r;
  const open = ["pending_payment", "receipt_submitted", "pending_approval", "confirmed"].includes(
    b.status,
  );
  return (
    <AdminShell ctx={ctx}>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-black">
          رزرو{" "}
          <span className="fa-nums" dir="ltr">
            {b.code}
          </span>
        </h1>
        <span className="rounded-full bg-black/5 px-3 py-1 text-xs">
          {STATUS_LABELS_FA[b.status]}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-black">مشتری</h2>
          <Link href={`/admin/customers/${c.id}`} className="font-bold hover:underline">
            {c.name}
          </Link>
          <div className="fa-nums text-sm" dir="ltr">
            <a href={`tel:${c.phone}`}>{formatIranMobile(c.phone)}</a>
          </div>
          {c.blocked && <p className="mt-1 text-xs text-red-600">این مشتری مسدود است</p>}
          {c.notes && <p className="mt-2 text-xs opacity-70">📝 {c.notes}</p>}
          {b.notes && <p className="mt-2 text-xs opacity-70">توضیح مشتری: {b.notes}</p>}
        </section>
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-black">نوبت</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="opacity-60">زمان</dt>
              <dd className="fa-nums font-bold">
                {formatInstantFa(b.startAt, ctx.tenant.timezone)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="opacity-60">خدمت</dt>
              <dd>
                {s.name} · {toPersianDigits(s.durationMin)}′
              </dd>
            </div>
            {ctx.tenant.mode !== "solo" && (
              <div className="flex justify-between">
                <dt className="opacity-60">آرایشگر</dt>
                <dd>{st.name}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="opacity-60">هزینه</dt>
              <dd className="fa-nums">{formatToman(b.priceSnapshot)}</dd>
            </div>
            {b.depositAmount > 0 && (
              <div className="flex justify-between">
                <dt className="opacity-60">بیعانه</dt>
                <dd className="fa-nums">
                  {formatToman(b.depositAmount)} {p ? `(${p.status})` : ""}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="opacity-60">منبع</dt>
              <dd>{b.source}</dd>
            </div>
            {b.cancelReason && (
              <div className="flex justify-between">
                <dt className="opacity-60">دلیل</dt>
                <dd>{b.cancelReason}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>
      {p?.receiptPath && (
        <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-black">رسید</h2>
          <a href={`/api/admin/receipt/${p.id}`} target="_blank" rel="noreferrer">
            <img
              src={`/api/admin/receipt/${p.id}`}
              alt="رسید"
              className="max-h-80 rounded-xl bg-black/5 object-contain"
            />
          </a>
          {p.trackingNo && (
            <p className="fa-nums mt-1 text-xs opacity-60">
              پیگیری: {toPersianDigits(p.trackingNo)}
            </p>
          )}
          {(b.status === "receipt_submitted" || b.status === "pending_approval") && (
            <div className="mt-3">
              <ReceiptActions
                bookingId={b.id}
                mode={b.status === "receipt_submitted" ? "receipt" : "approval"}
              />
            </div>
          )}
        </section>
      )}
      {open && (
        <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-black">عملیات</h2>
          <BookingActions
            bookingId={b.id}
            status={b.status}
            serviceId={s.id}
            staffId={st.id}
            startAt={b.startAt.toISOString()}
          />
        </section>
      )}
    </AdminShell>
  );
}
