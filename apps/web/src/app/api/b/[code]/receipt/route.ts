import {
  findBookingByCode,
  getStorage,
  normalizeBookingCode,
  submitReceipt,
  Errors,
  MAX_UPLOAD_BYTES,
} from "@arayeshgar/core";
import { db } from "@/lib/db";
import { clientIp, jsonError, rateLimit } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** multipart/form-data: file=<image>, trackingNo?=<string> */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const tenant = await requireTenant();
    if (!rateLimit(`receipt:${tenant.id}:${clientIp(req)}`, 10, 10 * 60_000))
      throw Errors.dailyLimit();
    const { code } = await ctx.params;
    const b = await findBookingByCode(db(), tenant.id, normalizeBookingCode(code));
    if (!b) throw Errors.bookingNotFound();
    if (b.booking.status === "expired") throw Errors.paymentExpired();
    if (b.booking.status !== "pending_payment")
      throw Errors.invalidTransition(b.booking.status, "receipt_submitted");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw Errors.validation("عکس رسید را انتخاب کنید.");
    if (file.size > MAX_UPLOAD_BYTES)
      throw Errors.validation("حجم فایل باید کمتر از ۵ مگابایت باشد.");
    const stored = await getStorage().saveImage(tenant.id, Buffer.from(await file.arrayBuffer()));
    const trackingNo = String(form.get("trackingNo") ?? "").trim() || undefined;
    const after = await submitReceipt(db(), tenant.id, b.booking.id, {
      receiptPath: stored.key,
      trackingNo,
    });
    return Response.json({ ok: true, status: after.booking.status });
  } catch (err) {
    return jsonError(err);
  }
}
