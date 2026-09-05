import { DomainError } from "@arayeshgar/core";
import { logger } from "@arayeshgar/core";

/** Uniform JSON error shape for route handlers: { error: { code, message } } */
export function jsonError(err: unknown, requestId?: string): Response {
  if (err instanceof DomainError) {
    return Response.json(
      { error: { code: err.code, message: err.message } },
      { status: statusFor(err.code) },
    );
  }
  logger.error(
    { err: String(err), stack: (err as Error)?.stack, requestId },
    "unhandled API error",
  );
  return Response.json(
    { error: { code: "INTERNAL", message: "خطای غیرمنتظره. لطفاً دوباره تلاش کنید." } },
    { status: 500 },
  );
}

function statusFor(code: DomainError["code"]): number {
  switch (code) {
    case "NOT_FOUND":
    case "BOOKING_NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "SLOT_TAKEN":
    case "INVALID_TRANSITION":
      return 409;
    case "TOO_MANY_ACTIVE_BOOKINGS":
    case "DAILY_LIMIT_REACHED":
      return 429;
    default:
      return 400;
  }
}

/** Tiny in-memory rate limiter (per process; fine for one VPS). */
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  b.n++;
  return b.n <= max;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
