import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { services, staff, staffServices, type Db } from "@arayeshgar/db";
import { Errors } from "../errors/domain";

export const serviceInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(60),
  description: z.string().max(200).optional().nullable(),
  durationMin: z.number().int().min(5).max(480),
  price: z.number().int().min(0).max(1_000_000_000),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
  /** salons: which staff offer it (solo: all staff automatically) */
  staffIds: z.array(z.string().uuid()).optional(),
});
export type ServiceInput = z.infer<typeof serviceInput>;

export async function listServices(db: Db, tenantId: string) {
  const rows = await db
    .select()
    .from(services)
    .where(eq(services.tenantId, tenantId))
    .orderBy(asc(services.sortOrder), asc(services.name));
  const links = rows.length
    ? await db
        .select()
        .from(staffServices)
        .where(
          inArray(
            staffServices.serviceId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  return rows.map((s) => ({
    ...s,
    staffIds: links.filter((l) => l.serviceId === s.id).map((l) => l.staffId),
  }));
}

/** Create or update. Keeps staff_services in sync: solo tenants link every active staff. */
export async function upsertService(db: Db, tenantId: string, input: ServiceInput) {
  const data = serviceInput.parse(input);
  return db.transaction(async (tx) => {
    let id = data.id;
    const values = {
      name: data.name,
      description: data.description ?? null,
      durationMin: data.durationMin,
      price: data.price,
      sortOrder: data.sortOrder,
      isActive: data.isActive,
    };
    if (id) {
      const [row] = await tx
        .update(services)
        .set(values)
        .where(and(eq(services.id, id), eq(services.tenantId, tenantId)))
        .returning();
      if (!row) throw Errors.notFound("خدمت");
    } else {
      const [row] = await tx
        .insert(services)
        .values({ tenantId, ...values })
        .returning();
      id = row!.id;
    }
    const allStaff = await tx
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.tenantId, tenantId), eq(staff.isActive, true)));
    const wanted = data.staffIds ?? allStaff.map((s) => s.id);
    const valid = new Set(allStaff.map((s) => s.id));
    await tx.delete(staffServices).where(eq(staffServices.serviceId, id));
    const links = wanted
      .filter((s) => valid.has(s))
      .map((staffId) => ({ staffId, serviceId: id! }));
    if (links.length) await tx.insert(staffServices).values(links);
    return id;
  });
}

/** Soft delete so historical bookings keep their service reference. */
export async function deactivateService(db: Db, tenantId: string, id: string) {
  const [row] = await db
    .update(services)
    .set({ isActive: false })
    .where(and(eq(services.id, id), eq(services.tenantId, tenantId)))
    .returning();
  if (!row) throw Errors.notFound("خدمت");
}
