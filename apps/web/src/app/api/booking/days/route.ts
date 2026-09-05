import { bookingDays } from "@/lib/booking-api";
import { jsonError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const tenant = await requireTenant();
    const q = new URL(req.url).searchParams;
    const serviceId = q.get("serviceId") ?? "";
    const staffId = q.get("staffId") || "any";
    return Response.json({ days: await bookingDays(tenant, serviceId, staffId) });
  } catch (err) {
    return jsonError(err);
  }
}
