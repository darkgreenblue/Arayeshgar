import { loadBookingContext, rejectReceipt, Errors } from "@arayeshgar/core";
import { requireAdminApi } from "@/lib/admin";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { tenant, user } = await requireAdminApi();
    const b = await loadBookingContext(db(), tenant.id, id);
    if (!b) throw Errors.bookingNotFound();
    await requireAdminApi("review_receipt", b.booking.staffId);
    const { reason } = (await req.json().catch(() => ({}))) as { reason?: string };
    const after = await rejectReceipt(db(), tenant.id, id, user.id, reason);
    return Response.json({ ok: true, status: after.booking.status });
  } catch (err) {
    return jsonError(err);
  }
}
