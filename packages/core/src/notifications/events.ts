/** Every domain event that produces notifications. Payload is what the renderer needs (no DB lookups at send time). */
export type NotificationKind =
  | "booking_created" // -> admins (and customer confirmation on chat channels)
  | "receipt_submitted" // -> admins with approve/reject buttons
  | "booking_confirmed" // -> customer
  | "booking_rejected" // -> customer
  | "booking_cancelled" // -> the other party
  | "booking_rescheduled" // -> customer
  | "booking_expired" // -> customer
  | "reminder_24h"; // -> customer

export type BookingPayload = {
  bookingId: string;
  code: string;
  status: string;
  startAt: string; // ISO
  endAt: string;
  serviceName: string;
  staffName: string;
  customerName: string;
  customerPhone: string;
  price: number;
  depositAmount: number;
  payTo?: { cardNumber?: string; cardHolder?: string; bankName?: string };
  paymentDeadline?: string; // ISO
  receiptPath?: string; // storage key; bots stream the file
  trackingNo?: string;
  reason?: string;
  previousStartAt?: string;
  siteUrl: string; // tenant public url
  audience: "admin" | "customer";
};
