import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { services, staff, staffServices, type Tenant } from "@arayeshgar/db";
import {
  availableDays,
  availableSlots,
  formatJalaliLong,
  formatMinutes,
  jalaliKey,
  localDateOf,
  parseJalaliKey,
  toLocal,
  Errors,
} from "@arayeshgar/core";
import { db } from "./db";

/** Services + staff for step 1 (only staff who offer at least one service). */
export async function bookingOptions(tenant: Tenant) {
  const [svc, people] = await Promise.all([
    db()
      .select({
        id: services.id,
        name: services.name,
        description: services.description,
        durationMin: services.durationMin,
        price: services.price,
      })
      .from(services)
      .where(and(eq(services.tenantId, tenant.id), eq(services.isActive, true)))
      .orderBy(asc(services.sortOrder), asc(services.name)),
    db()
      .select({ id: staff.id, name: staff.name, photoUrl: staff.photoUrl, bio: staff.bio })
      .from(staff)
      .where(and(eq(staff.tenantId, tenant.id), eq(staff.isActive, true)))
      .orderBy(asc(staff.sortOrder), asc(staff.name)),
  ]);
  const links = people.length
    ? await db()
        .select({ staffId: staffServices.staffId, serviceId: staffServices.serviceId })
        .from(staffServices)
        .where(
          inArray(
            staffServices.staffId,
            people.map((p) => p.id),
          ),
        )
    : [];
  return {
    mode: tenant.mode,
    showStaffPicker: tenant.mode !== "solo" && people.length > 1,
    services: svc,
    staff: people.map((p) => ({
      ...p,
      serviceIds: links.filter((l) => l.staffId === p.id).map((l) => l.serviceId),
    })),
  };
}

export type DayOption = { key: string; label: string; weekday: string };

export async function bookingDays(
  tenant: Tenant,
  serviceId: string,
  staffId: string | "any",
): Promise<DayOption[]> {
  const days = await availableDays(db(), tenant, { serviceId, staffId });
  return days.map((d) => {
    const label = formatJalaliLong(d);
    return { key: jalaliKey(d), label, weekday: label.split(" ")[0]! };
  });
}

export type SlotOption = { iso: string; label: string; staffId: string };

export async function bookingSlots(
  tenant: Tenant,
  serviceId: string,
  staffId: string | "any",
  dayKey: string,
): Promise<SlotOption[]> {
  const day = parseJalaliKey(dayKey);
  if (!day) throw Errors.validation("تاریخ نامعتبر است.");
  const per = await availableSlots(db(), tenant, { serviceId, staffId, day });
  // Merge across staff for "any": one chip per distinct start time.
  const seen = new Map<number, SlotOption>();
  for (const s of per) {
    for (const d of s.starts) {
      if (seen.has(d.getTime())) continue;
      const l = toLocal(d, tenant.timezone);
      seen.set(d.getTime(), {
        iso: d.toISOString(),
        label: formatMinutes(l.hh * 60 + l.mm),
        staffId: staffId === "any" ? "any" : s.staffId,
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.iso.localeCompare(b.iso));
}

export function todayKey(tenant: Tenant): string {
  return jalaliKey(localDateOf(new Date(), tenant.timezone));
}
