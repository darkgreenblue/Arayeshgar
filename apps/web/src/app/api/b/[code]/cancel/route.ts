import {
  cancelByCustomer,
  findBookingByCode,
  normalizeBookingCode,
  Errors,
} from "@arayeshgar/core";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const tenant = await requireTenant();
    const { code } = await ctx.params;
    const b = await findBookingByCode(db(), tenant.id, normalizeBookingCode(code));
    if (!b) throw Errors.bookingNotFound();
    const after = await cancelByCustomer(db(), tenant.id, b.booking.id);
    return Response.json({ ok: true, status: after.booking.status });
  } catch (err) {
    return jsonError(err);
  }
}
