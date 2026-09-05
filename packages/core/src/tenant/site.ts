/**
 * Everything a public site page needs, in one query bundle. Themes receive this object.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Db, Service, Staff, Tenant } from "@arayeshgar/db";
import { schedules, services, staff } from "@arayeshgar/db";
import { formatMinutes } from "../utils/jalali";

export type OpeningHours = { weekday: number; label: string; ranges: string[] }[]; // weekday 0=Sat

export type SiteContent = {
  tenant: Tenant;
  services: Service[];
  staff: Staff[];
  hours: OpeningHours;
  showStaffPicker: boolean;
};

const WEEKDAYS_FA = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

export async function loadSiteContent(db: Db, tenant: Tenant): Promise<SiteContent> {
  const [svc, people] = await Promise.all([
    db
      .select()
      .from(services)
      .where(and(eq(services.tenantId, tenant.id), eq(services.isActive, true)))
      .orderBy(asc(services.sortOrder), asc(services.name)),
    db
      .select()
      .from(staff)
      .where(and(eq(staff.tenantId, tenant.id), eq(staff.isActive, true)))
      .orderBy(asc(staff.sortOrder), asc(staff.name)),
  ]);
  // Opening hours shown on the site = union of all staff schedules (solo: exactly one).
  const rows = await db
    .select({ weekday: schedules.weekday, s: schedules.startMin, e: schedules.endMin })
    .from(schedules)
    .where(eq(schedules.tenantId, tenant.id))
    .orderBy(asc(schedules.weekday), asc(schedules.startMin));
  const byDay = new Map<number, Set<string>>();
  for (const r of rows) {
    const set = byDay.get(r.weekday) ?? new Set<string>();
    set.add(`${formatMinutes(r.s)} تا ${formatMinutes(r.e)}`);
    byDay.set(r.weekday, set);
  }
  const hours: OpeningHours = WEEKDAYS_FA.map((label, weekday) => ({
    weekday,
    label,
    ranges: [...(byDay.get(weekday) ?? [])],
  }));
  return {
    tenant,
    services: svc,
    staff: people,
    hours,
    showStaffPicker: tenant.mode !== "solo" && people.length > 1,
  };
}
