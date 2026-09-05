import { bookingSlots } from "@/lib/booking-api";
import { jsonError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const tenant = await requireTenant();
    const q = new URL(req.url).searchParams;
    return Response.json({
      slots: await bookingSlots(
        tenant,
        q.get("serviceId") ?? "",
        q.get("staffId") || "any",
        q.get("day") ?? "",
      ),
    });
  } catch (err) {
    return jsonError(err);
  }
}
