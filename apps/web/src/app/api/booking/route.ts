import { z } from "zod";
import { createBooking, Errors, logger } from "@arayeshgar/core";
import { db } from "@/lib/db";
import { clientIp, jsonError, rateLimit } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const body = z.object({
  serviceId: z.string().uuid(),
  staffId: z.union([z.string().uuid(), z.literal("any")]),
  startAt: z.string().datetime(),
  name: z.string().min(2).max(80),
  phone: z.string().min(10).max(20),
  notes: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant();
    const ip = clientIp(req);
    if (!rateLimit(`book:${tenant.id}:${ip}`, 10, 10 * 60_000)) throw Errors.dailyLimit();
    const parsed = body.safeParse(await req.json());
    if (!parsed.success) throw Errors.validation("اطلاعات فرم کامل نیست.");
    const d = parsed.data;
    const result = await createBooking(db(), {
      tenant,
      serviceId: d.serviceId,
      staffId: d.staffId,
      startAt: new Date(d.startAt),
      customer: { name: d.name, phone: d.phone },
      notes: d.notes,
      source: "web",
    });
    logger.info({ tenantId: tenant.id, bookingId: result.bookingId, ip }, "web booking created");
    return Response.json(result, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
