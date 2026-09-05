import { and, eq } from "drizzle-orm";
import { Readable } from "node:stream";
import { payments } from "@arayeshgar/db";
import { getStorage, mimeFromKey, Errors } from "@arayeshgar/core";
import { requireAdminApi } from "@/lib/admin";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
/** Streams a receipt image to an authenticated admin of the same tenant. Never public. */
export async function GET(_req: Request, ctx: { params: Promise<{ paymentId: string }> }) {
  try {
    const { paymentId } = await ctx.params;
    const { tenant } = await requireAdminApi("view_bookings");
    const p = await db().query.payments.findFirst({
      where: and(eq(payments.id, paymentId), eq(payments.tenantId, tenant.id)),
    });
    if (!p?.receiptPath) throw Errors.notFound("رسید");
    const storage = getStorage();
    if (!(await storage.exists(p.receiptPath))) throw Errors.notFound("فایل رسید");
    const stream = Readable.toWeb(storage.openStream(p.receiptPath)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "content-type": mimeFromKey(p.receiptPath),
        "cache-control": "private, max-age=300",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
