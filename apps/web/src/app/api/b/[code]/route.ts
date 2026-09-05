import {
  findBookingByCode,
  normalizeBookingCode,
  Errors,
  STATUS_LABELS_FA,
  effectiveRules,
  isEnabled,
} from "@arayeshgar/core";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Public status of a booking. The code is the secret; phone is masked. */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const tenant = await requireTenant();
    const { code } = await ctx.params;
    const b = await findBookingByCode(db(), tenant.id, normalizeBookingCode(code));
    if (!b) throw Errors.bookingNotFound();
    const rules = effectiveRules(tenant);
    const canCancel =
      isEnabled(tenant, "customer_cancel") &&
      ["pending_payment", "receipt_submitted", "pending_approval", "confirmed"].includes(
        b.booking.status,
      ) &&
      b.booking.startAt.getTime() - Date.now() >= rules.cancelBeforeHours * 3_600_000;
    return Response.json({
      code: b.booking.code,
      status: b.booking.status,
      statusLabel: STATUS_LABELS_FA[b.booking.status],
      startAt: b.booking.startAt.toISOString(),
      endAt: b.booking.endAt.toISOString(),
      service: b.service.name,
      staff: b.staff.name,
      customerName: b.customer.name,
      phoneMasked: `${b.customer.phone.slice(0, 4)}***${b.customer.phone.slice(-2)}`,
      price: b.booking.priceSnapshot,
      depositAmount: b.booking.depositAmount,
      expiresAt: b.booking.expiresAt?.toISOString() ?? null,
      payTo: b.payment
        ? { cardNumber: b.payment.payToCardNumber, cardHolder: b.payment.payToCardHolder }
        : null,
      paymentStatus: b.payment?.status ?? null,
      rejectReason: b.payment?.rejectReason ?? b.booking.cancelReason ?? null,
      canCancel,
      cancelBeforeHours: rules.cancelBeforeHours,
      policyText: tenant.depositSettings.policyText ?? null,
    });
  } catch (err) {
    return jsonError(err);
  }
}
