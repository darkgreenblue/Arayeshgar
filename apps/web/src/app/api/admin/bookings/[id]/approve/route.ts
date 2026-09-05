import { approveReceipt, confirmBooking, loadBookingContext, Errors } from "@arayeshgar/core";
import { requireAdminApi } from "@/lib/admin";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
/** Approves a submitted receipt, or confirms a pending_approval booking. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { tenant, user } = await requireAdminApi();
    const b = await loadBookingContext(db(), tenant.id, id);
    if (!b) throw Errors.bookingNotFound();
    await requireAdminApi("review_receipt", b.booking.staffId);
    const after =
      b.booking.status === "pending_approval"
        ? await confirmBooking(db(), tenant.id, id, user.id)
        : await approveReceipt(db(), tenant.id, id, user.id);
    return Response.json({ ok: true, status: after.booking.status });
  } catch (err) {
    return jsonError(err);
  }
}
