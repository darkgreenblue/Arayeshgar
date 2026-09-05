/**
 * Platform-agnostic message rendering (Persian). Bots turn `buttons` into inline keyboards;
 * the web panel can reuse the text for in-app toasts. Keep every message short and scannable.
 */
import { formatCardNumber, formatIranMobile, formatToman, toPersianDigits } from "../utils/phone";
import { formatInstantFa } from "../utils/jalali";
import type { BookingPayload, NotificationKind } from "./events";

export type Button = { text: string; data?: string; url?: string };
export type RenderedMessage = { text: string; buttons: Button[][]; photoPath?: string };

const line = (label: string, value: string | undefined) => (value ? `${label}: ${value}` : "");

function bookingLines(p: BookingPayload): string {
  return [
    line("خدمت", p.serviceName),
    line("زمان", formatInstantFa(new Date(p.startAt))),
    p.audience === "admin"
      ? line("مشتری", `${p.customerName} (${formatIranMobile(p.customerPhone)})`)
      : line("آرایشگر", p.staffName),
    line("کد رزرو", p.code),
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderNotification(kind: NotificationKind, p: BookingPayload): RenderedMessage {
  const track: Button = { text: "مشاهده رزرو", url: `${p.siteUrl}/b/${p.code}` };
  switch (kind) {
    case "booking_created":
      if (p.audience === "admin") {
        const waiting =
          p.depositAmount > 0
            ? "\n⏳ در انتظار پرداخت بیعانه"
            : p.status === "confirmed"
              ? "\n✅ تأیید خودکار شد"
              : "\n🕐 در انتظار تأیید شما";
        return {
          text: `🆕 رزرو جدید\n${bookingLines(p)}${waiting}`,
          buttons:
            p.status === "pending_approval"
              ? [
                  [
                    { text: "✅ تأیید", data: `bk:confirm:${p.bookingId}` },
                    { text: "❌ رد", data: `bk:reject:${p.bookingId}` },
                  ],
                ]
              : [],
        };
      }
      if (p.depositAmount > 0 && p.payTo?.cardNumber) {
        return {
          text:
            `✅ وقت شما موقتاً رزرو شد\n${bookingLines(p)}\n\n` +
            `برای نهایی شدن، بیعانه ${formatToman(p.depositAmount)} را کارت‌به‌کارت کنید:\n` +
            `💳 ${formatCardNumber(p.payTo.cardNumber)}\n` +
            `${line("به نام", p.payTo.cardHolder)}${p.payTo.bankName ? ` (${p.payTo.bankName})` : ""}\n\n` +
            (p.paymentDeadline
              ? `⏰ مهلت: تا ${formatInstantFa(new Date(p.paymentDeadline))}\n`
              : "") +
            `بعد از پرداخت، عکس رسید را همین‌جا بفرستید.`,
          buttons: [[{ text: "📎 رسید را می‌فرستم", data: `bk:receipt:${p.bookingId}` }], [track]],
        };
      }
      return {
        text:
          p.status === "confirmed"
            ? `✅ رزرو شما ثبت و تأیید شد\n${bookingLines(p)}`
            : `✅ رزرو شما ثبت شد و منتظر تأیید آرایشگر است\n${bookingLines(p)}`,
        buttons: [[track]],
      };

    case "receipt_submitted":
      return {
        text: `🧾 رسید بیعانه ارسال شد\n${bookingLines(p)}\n${line("مبلغ", formatToman(p.depositAmount))}\n${line("شماره پیگیری", p.trackingNo ? toPersianDigits(p.trackingNo) : undefined)}`.trim(),
        buttons: [
          [
            { text: "✅ تأیید رسید", data: `bk:approve:${p.bookingId}` },
            { text: "❌ رد رسید", data: `bk:reject:${p.bookingId}` },
          ],
        ],
        photoPath: p.receiptPath,
      };

    case "booking_confirmed":
      return {
        text: `🎉 رزرو شما تأیید شد\n${bookingLines(p)}\n\nمنتظرتان هستیم.`,
        buttons: [[track]],
      };

    case "booking_rejected":
      return {
        text: `❌ رسید شما تأیید نشد\n${bookingLines(p)}\n${line("دلیل", p.reason)}\n\nلطفاً دوباره رزرو کنید یا با آرایشگر تماس بگیرید.`.trim(),
        buttons: [[track]],
      };

    case "booking_cancelled":
      return {
        text: `🚫 رزرو لغو شد\n${bookingLines(p)}\n${line("دلیل", p.reason)}`.trim(),
        buttons: p.audience === "customer" ? [[{ text: "رزرو جدید", url: p.siteUrl }]] : [],
      };

    case "booking_rescheduled":
      return {
        text: `🔁 زمان رزرو شما تغییر کرد\n${p.previousStartAt ? `قبلی: ${formatInstantFa(new Date(p.previousStartAt))}\n` : ""}جدید: ${formatInstantFa(new Date(p.startAt))}\n${line("کد رزرو", p.code)}`,
        buttons: [[track]],
      };

    case "booking_expired":
      return {
        text: `⌛ مهلت پرداخت بیعانه تمام شد و رزرو ${p.code} آزاد شد.\nاگر هنوز مایلید، دوباره رزرو کنید.`,
        buttons: [[{ text: "رزرو دوباره", url: p.siteUrl }]],
      };

    case "reminder_24h":
      return { text: `⏰ یادآوری: فردا نوبت دارید\n${bookingLines(p)}`, buttons: [[track]] };
  }
}
