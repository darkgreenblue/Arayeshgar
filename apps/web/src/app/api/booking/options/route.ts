import { bookingOptions } from "@/lib/booking-api";
import { jsonError } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const tenant = await requireTenant();
    return Response.json(await bookingOptions(tenant));
  } catch (err) {
    return jsonError(err);
  }
}
