import type { Booking, Customer, Service, Staff, Tenant, Payment } from "@arayeshgar/db";
import type { BookingPayload } from "../notifications/events";

export type BookingContext = {
  tenant: Tenant;
  booking: Booking;
  customer: Customer;
  service: Service;
  staff: Staff;
  payment: Payment | null;
  identityChatId: string | null; // customer's chat id on the booking's source platform
};

export function toPayload(
  ctx: BookingContext,
  audience: "admin" | "customer",
  siteUrl: string,
  extra: Partial<BookingPayload> = {},
): BookingPayload {
  const { booking: b, payment } = ctx;
  return {
    bookingId: b.id,
    code: b.code,
    status: b.status,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    serviceName: ctx.service.name,
    staffName: ctx.staff.name,
    customerName: ctx.customer.name,
    customerPhone: ctx.customer.phone,
    price: b.priceSnapshot,
    depositAmount: b.depositAmount,
    payTo: payment
      ? {
          cardNumber: payment.payToCardNumber ?? undefined,
          cardHolder: payment.payToCardHolder ?? undefined,
        }
      : undefined,
    paymentDeadline: b.expiresAt?.toISOString(),
    receiptPath: payment?.receiptPath ?? undefined,
    trackingNo: payment?.trackingNo ?? undefined,
    siteUrl,
    audience,
    ...extra,
  };
}
