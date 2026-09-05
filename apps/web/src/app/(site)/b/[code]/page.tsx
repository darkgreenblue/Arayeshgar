import Link from "next/link";
import { notFound } from "next/navigation";
import {
  findBookingByCode,
  normalizeBookingCode,
  STATUS_LABELS_FA,
  effectiveRules,
  isEnabled,
  formatInstantFa,
  formatToman,
  formatCardNumber,
} from "@arayeshgar/core";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { themeShell } from "@/themes";
import { ReceiptForm } from "@/components/booking/ReceiptForm";
import { CancelButton } from "@/components/booking/CancelButton";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  confirmed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  completed: "bg-emerald-500/15",
  pending_payment: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  receipt_submitted: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  pending_approval: "bg-sky-500/15",
  cancelled: "bg-neutral-500/15",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  expired: "bg-red-500/15",
  no_show: "bg-neutral-500/15",
};

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const tenant = await requireTenant();
  const { code } = await params;
  const { new: isNew } = await searchParams;
  const ctx = await findBookingByCode(db(), tenant.id, normalizeBookingCode(code));
  if (!ctx) notFound();
  const { booking: b, payment } = ctx;
  const rules = effectiveRules(tenant);
  const canCancel =
    isEnabled(tenant, "customer_cancel") &&
    ["pending_payment", "receipt_submitted", "pending_approval", "confirmed"].includes(b.status) &&
    b.startAt.getTime() - Date.now() >= rules.cancelBeforeHours * 3_600_000;
  const Shell = themeShell(tenant.theme);

  return (
    <Shell tenant={tenant} title={`رزرو ${b.code}`}>
      <div className="mx-auto max-w-xl px-4 py-6">
        {isNew && b.status === "confirmed" && (
          <p className="mb-4 rounded-2xl bg-emerald-500/15 p-4 text-center font-bold">
            🎉 رزرو شما ثبت و تأیید شد
          </p>
        )}
        {isNew && b.status === "pending_payment" && (
          <p className="mb-4 rounded-2xl bg-amber-500/15 p-4 text-center font-bold">
            ✅ وقت شما موقتاً رزرو شد؛ برای نهایی شدن بیعانه را پرداخت کنید
          </p>
        )}
        {isNew && b.status === "pending_approval" && (
          <p className="mb-4 rounded-2xl bg-sky-500/15 p-4 text-center font-bold">
            ✅ رزرو شما ثبت شد و منتظر تأیید آرایشگر است
          </p>
        )}

        <div className="rounded-3xl border border-current/10 p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs opacity-60">کد رزرو</div>
              <div className="fa-nums text-2xl font-black tracking-widest" dir="ltr">
                {b.code}
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE[b.status] ?? ""}`}
            >
              {STATUS_LABELS_FA[b.status]}
            </span>
          </div>
          <dl className="grid gap-2 text-sm">
            <Row k="خدمت" v={ctx.service.name} />
            <Row k="آرایشگر" v={ctx.staff.name} />
            <Row k="زمان" v={formatInstantFa(b.startAt, tenant.timezone)} />
            <Row k="نام" v={ctx.customer.name} />
            <Row k="هزینه خدمت" v={formatToman(b.priceSnapshot)} />
            {b.depositAmount > 0 && <Row k="بیعانه" v={formatToman(b.depositAmount)} />}
          </dl>
        </div>

        {b.status === "pending_payment" && payment && (
          <section className="mt-4 rounded-3xl border border-amber-500/40 bg-amber-500/5 p-5">
            <h2 className="mb-2 text-lg font-bold">پرداخت بیعانه</h2>
            <p className="text-sm opacity-80">
              مبلغ <b className="fa-nums">{formatToman(b.depositAmount)}</b> را به کارت زیر
              کارت‌به‌کارت کنید و عکس رسید را بفرستید.
            </p>
            {payment.payToCardNumber && (
              <div className="my-3 rounded-2xl bg-black/5 p-4 text-center dark:bg-white/5">
                <div className="fa-nums text-xl font-black tracking-wider" dir="ltr">
                  {formatCardNumber(payment.payToCardNumber)}
                </div>
                {payment.payToCardHolder && (
                  <div className="mt-1 text-sm opacity-80">به نام {payment.payToCardHolder}</div>
                )}
              </div>
            )}
            {b.expiresAt && (
              <p className="text-xs opacity-70">
                ⏰ مهلت پرداخت: {formatInstantFa(b.expiresAt, tenant.timezone)}
              </p>
            )}
            {tenant.depositSettings.policyText && (
              <p className="mt-2 text-xs opacity-60">{tenant.depositSettings.policyText}</p>
            )}
            <ReceiptForm code={b.code} />
          </section>
        )}

        {b.status === "receipt_submitted" && (
          <p className="mt-4 rounded-2xl bg-sky-500/10 p-4 text-sm">
            رسید شما دریافت شد. بعد از بررسی آرایشگر، وضعیت همین‌جا به «تأیید شده» تغییر می‌کند. این
            صفحه را ذخیره کنید.
          </p>
        )}
        {b.status === "rejected" && (
          <p className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm">
            رسید تأیید نشد{payment?.rejectReason ? `: ${payment.rejectReason}` : ""}. لطفاً دوباره
            رزرو کنید یا با آرایشگر تماس بگیرید.
          </p>
        )}
        {b.status === "expired" && (
          <p className="mt-4 rounded-2xl bg-red-500/10 p-4 text-sm">
            مهلت پرداخت تمام شد و وقت آزاد شد.{" "}
            <Link className="underline" href="/book">
              دوباره رزرو کنید
            </Link>
            .
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {canCancel && <CancelButton code={b.code} hours={rules.cancelBeforeHours} />}
          <Link href="/" className="text-sm opacity-70 hover:opacity-100">
            صفحه اصلی
          </Link>
        </div>
        <p className="mt-6 text-xs opacity-50">
          این لینک را نگه دارید؛ وضعیت رزرو همیشه از همین‌جا قابل مشاهده است.
        </p>
      </div>
    </Shell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-current/5 pb-2 last:border-0">
      <dt className="opacity-60">{k}</dt>
      <dd className="fa-nums font-bold">{v}</dd>
    </div>
  );
}
