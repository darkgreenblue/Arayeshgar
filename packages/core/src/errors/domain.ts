/**
 * Typed domain errors. `code` is stable for programmatic handling (API, bots);
 * `message` is the Persian text safe to show to the end user.
 */
export type DomainErrorCode =
  | "SLOT_TAKEN"
  | "SLOT_UNAVAILABLE"
  | "INVALID_PHONE"
  | "CUSTOMER_BLOCKED"
  | "TOO_MANY_ACTIVE_BOOKINGS"
  | "DAILY_LIMIT_REACHED"
  | "BOOKING_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "PAYMENT_EXPIRED"
  | "CANCEL_WINDOW_CLOSED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const Errors = {
  slotTaken: () =>
    new DomainError("SLOT_TAKEN", "این وقت همین الان رزرو شد. لطفاً وقت دیگری انتخاب کنید."),
  slotUnavailable: () => new DomainError("SLOT_UNAVAILABLE", "این وقت قابل رزرو نیست."),
  invalidPhone: () =>
    new DomainError("INVALID_PHONE", "شماره موبایل معتبر نیست. نمونه: ۰۹۱۲۳۴۵۶۷۸۹"),
  customerBlocked: () =>
    new DomainError(
      "CUSTOMER_BLOCKED",
      "امکان رزرو برای این شماره وجود ندارد. لطفاً با آرایشگر تماس بگیرید.",
    ),
  tooManyActive: () =>
    new DomainError(
      "TOO_MANY_ACTIVE_BOOKINGS",
      "شما یک رزرو در انتظار پرداخت دارید. اول آن را تکمیل یا لغو کنید.",
    ),
  dailyLimit: () =>
    new DomainError("DAILY_LIMIT_REACHED", "سقف رزرو روزانه برای این شماره پر شده است."),
  bookingNotFound: () => new DomainError("BOOKING_NOT_FOUND", "رزروی با این کد پیدا نشد."),
  invalidTransition: (from: string, to: string) =>
    new DomainError(
      "INVALID_TRANSITION",
      "وضعیت این رزرو تغییر کرده است؛ لطفاً صفحه را تازه کنید.",
      { from, to },
    ),
  paymentExpired: () =>
    new DomainError(
      "PAYMENT_EXPIRED",
      "مهلت پرداخت این رزرو تمام شده است. لطفاً دوباره رزرو کنید.",
    ),
  cancelWindowClosed: (hours: number) =>
    new DomainError(
      "CANCEL_WINDOW_CLOSED",
      `لغو فقط تا ${hours} ساعت قبل از نوبت ممکن است. برای لغو با آرایشگر تماس بگیرید.`,
    ),
  forbidden: () => new DomainError("FORBIDDEN", "شما اجازه این کار را ندارید."),
  notFound: (what = "مورد") => new DomainError("NOT_FOUND", `${what} پیدا نشد.`),
  validation: (msg: string) => new DomainError("VALIDATION", msg),
};

/** Postgres exclusion_violation (23P01) or unique_violation (23505), possibly wrapped by drizzle. */
export function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code ?? e?.cause?.code;
}
