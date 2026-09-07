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

/**
 * SQLite reports every constraint failure with the same coarse `SQLITE_CONSTRAINT`
 * code; only the extended code says which constraint. Matching the coarse one would
 * make a CHECK failure — always a bug — look exactly like a lost slot race and get
 * silently retried, so the extended code is what we read.
 *
 * The chain is walked because drizzle wraps driver errors, and libsql itself puts the
 * extended name on `cause` while keeping the numeric extended code on `rawCode`.
 */
function errorChain(err: unknown): { code?: string; rawCode?: number }[] {
  const out: { code?: string; rawCode?: number }[] = [];
  let cur = err as { code?: string; rawCode?: number; cause?: unknown } | undefined;
  for (let depth = 0; cur && typeof cur === "object" && depth < 5; depth++) {
    out.push({ code: cur.code, rawCode: cur.rawCode });
    cur = cur.cause as typeof cur;
  }
  return out;
}

/** SQLITE_CONSTRAINT_UNIQUE (2067) or SQLITE_CONSTRAINT_PRIMARYKEY (1555). */
export function isUniqueViolation(err: unknown): boolean {
  return errorChain(err).some(
    (e) =>
      e.rawCode === 2067 ||
      e.rawCode === 1555 ||
      e.code === "SQLITE_CONSTRAINT_UNIQUE" ||
      e.code === "SQLITE_CONSTRAINT_PRIMARYKEY",
  );
}

/** SQLITE_BUSY: another process held the write lock past busy_timeout. */
export function isBusy(err: unknown): boolean {
  return errorChain(err).some((e) => e.code === "SQLITE_BUSY" || e.rawCode === 5);
}
