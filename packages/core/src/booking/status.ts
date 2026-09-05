import type { BookingStatus } from "@arayeshgar/db";

/** Allowed transitions. Anything not listed is rejected with INVALID_TRANSITION. */
export const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending_payment: ["receipt_submitted", "expired", "cancelled"],
  receipt_submitted: ["confirmed", "rejected", "cancelled"],
  pending_approval: ["confirmed", "cancelled", "rejected"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [],
  cancelled: [],
  rejected: [],
  expired: [],
  no_show: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export const STATUS_LABELS_FA: Record<BookingStatus, string> = {
  pending_payment: "در انتظار پرداخت بیعانه",
  receipt_submitted: "رسید ارسال شد، در انتظار تأیید",
  pending_approval: "در انتظار تأیید آرایشگر",
  confirmed: "تأیید شده",
  completed: "انجام شده",
  cancelled: "لغو شده",
  rejected: "رسید رد شد",
  expired: "مهلت پرداخت تمام شد",
  no_show: "مراجعه نشد",
};

/** Statuses a customer sees as "your appointment is on". */
export const CUSTOMER_ACTIVE: readonly BookingStatus[] = [
  "pending_payment",
  "receipt_submitted",
  "pending_approval",
  "confirmed",
];
