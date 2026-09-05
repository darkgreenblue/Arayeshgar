/**
 * DB-aware availability: working windows from weekly schedules + overrides (or manual slots),
 * busy from active bookings. All channels call these same functions => instant consistency.
 */
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { Db, Tx } from "@arayeshgar/db";
import {
  ACTIVE_BOOKING_STATUSES,
  bookings,
  manualSlots,
  scheduleOverrides,
  schedules,
  staff,
  staffServices,
  services,
} from "@arayeshgar/db";
import type { Tenant } from "@arayeshgar/db";
import { isEnabled } from "../features/registry";
import { effectiveRules } from "../tenant/config";
import {
  addDays,
  isoDate,
  localDateOf,
  localToInstant,
  persianWeekday,
  type LocalDate,
} from "../utils/jalali";
import {
  computeSlots,
  isStartValid,
  normalize,
  subtract,
  type Interval,
  type SlotInput,
} from "./slots";

export type DbLike = Db | Tx;

export type ServiceForStaff = { serviceId: string; durationMin: number; price: number };

/** Effective duration/price of a service for a staff member (staff_services overrides win). */
export async function resolveServiceForStaff(
  db: DbLike,
  staffId: string,
  serviceId: string,
): Promise<ServiceForStaff | null> {
  const rows = await db
    .select({
      serviceId: services.id,
      durationMin: sql<number>`coalesce(${staffServices.durationOverrideMin}, ${services.durationMin})`,
      price: sql<number>`coalesce(${staffServices.priceOverride}, ${services.price})`,
      active: services.isActive,
    })
    .from(services)
    .innerJoin(
      staffServices,
      and(eq(staffServices.serviceId, services.id), eq(staffServices.staffId, staffId)),
    )
    .where(eq(services.id, serviceId))
    .limit(1);
  const r = rows[0];
  if (!r || !r.active) return null;
  return { serviceId: r.serviceId, durationMin: Number(r.durationMin), price: Number(r.price) };
}

/** Bookable windows (instants) for one staff on one local day. */
export async function workingWindows(
  db: DbLike,
  tenant: Tenant,
  staffId: string,
  day: LocalDate,
): Promise<Interval[]> {
  const tz = tenant.timezone;
  const toMs = (min: number) => localToInstant(day, min, tz).getTime();

  if (isEnabled(tenant, "manual_slots")) {
    const dayStart = localToInstant(day, 0, tz);
    const dayEnd = localToInstant(addDays(day, 1), 0, tz);
    const rows = await db
      .select({ s: manualSlots.startAt, e: manualSlots.endAt })
      .from(manualSlots)
      .where(
        and(
          eq(manualSlots.staffId, staffId),
          lt(manualSlots.startAt, dayEnd),
          gt(manualSlots.endAt, dayStart),
        ),
      );
    return normalize(rows.map((r) => ({ start: r.s.getTime(), end: r.e.getTime() })));
  }

  const weekday = persianWeekday(day);
  const [weekly, overrides] = await Promise.all([
    db
      .select({ s: schedules.startMin, e: schedules.endMin })
      .from(schedules)
      .where(and(eq(schedules.staffId, staffId), eq(schedules.weekday, weekday))),
    db
      .select({
        kind: scheduleOverrides.kind,
        s: scheduleOverrides.startMin,
        e: scheduleOverrides.endMin,
      })
      .from(scheduleOverrides)
      .where(and(eq(scheduleOverrides.staffId, staffId), eq(scheduleOverrides.day, isoDate(day)))),
  ]);

  let windows: Interval[] = weekly.map((r) => ({ start: toMs(r.s), end: toMs(r.e) }));
  for (const o of overrides) {
    if (o.kind === "closed") {
      if (o.s == null || o.e == null) return []; // whole day closed
      windows = subtract(windows, [{ start: toMs(o.s), end: toMs(o.e) }]);
    } else if (o.s != null && o.e != null) {
      windows = normalize([...windows, { start: toMs(o.s), end: toMs(o.e) }]);
    }
  }
  return windows;
}

/** Active bookings of a staff intersecting [from, to). */
export async function busyIntervals(
  db: DbLike,
  staffId: string,
  from: Date,
  to: Date,
): Promise<Interval[]> {
  const rows = await db
    .select({ s: bookings.startAt, e: bookings.endAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.staffId, staffId),
        lt(bookings.startAt, to),
        gt(bookings.endAt, from),
        inArray(bookings.status, [...ACTIVE_BOOKING_STATUSES]),
      ),
    );
  return rows.map((r) => ({ start: r.s.getTime(), end: r.e.getTime() }));
}

export async function buildSlotInput(
  db: DbLike,
  tenant: Tenant,
  staffId: string,
  day: LocalDate,
  durationMin: number,
  now = new Date(),
): Promise<SlotInput> {
  const rules = effectiveRules(tenant);
  const tz = tenant.timezone;
  const dayStart = localToInstant(day, 0, tz);
  const dayEnd = localToInstant(addDays(day, 1), 0, tz);
  const [working, busy] = await Promise.all([
    workingWindows(db, tenant, staffId, day),
    // widen the window so bookings straddling midnight or buffers are counted
    busyIntervals(
      db,
      staffId,
      new Date(dayStart.getTime() - 6 * 3_600_000),
      new Date(dayEnd.getTime() + 6 * 3_600_000),
    ),
  ]);
  return {
    working,
    busy,
    durationMs: durationMin * 60_000,
    stepMs: rules.slotStepMin * 60_000,
    bufferMs: rules.bufferMin * 60_000,
    earliestStart: now.getTime() + rules.minLeadMin * 60_000,
  };
}

export type StaffSlots = { staffId: string; starts: Date[] };

/** Available start instants for one staff (or every active staff when staffId is "any"). */
export async function availableSlots(
  db: DbLike,
  tenant: Tenant,
  opts: { staffId: string | "any"; serviceId: string; day: LocalDate; now?: Date },
): Promise<StaffSlots[]> {
  const now = opts.now ?? new Date();
  const rules = effectiveRules(tenant);
  const today = localDateOf(now, tenant.timezone);
  const horizonEnd = addDays(today, rules.horizonDays);
  if (compareDays(opts.day, today) < 0 || compareDays(opts.day, horizonEnd) > 0) return [];

  const staffIds =
    opts.staffId === "any"
      ? (
          await db
            .select({ id: staff.id })
            .from(staff)
            .where(and(eq(staff.tenantId, tenant.id), eq(staff.isActive, true)))
        ).map((r) => r.id)
      : [opts.staffId];

  const out: StaffSlots[] = [];
  for (const sid of staffIds) {
    const svc = await resolveServiceForStaff(db, sid, opts.serviceId);
    if (!svc) continue;
    const input = await buildSlotInput(db, tenant, sid, opts.day, svc.durationMin, now);
    out.push({ staffId: sid, starts: computeSlots(input).map((ms) => new Date(ms)) });
  }
  return out;
}

/** Days in the horizon that have at least one slot (for the calendar step). */
export async function availableDays(
  db: DbLike,
  tenant: Tenant,
  opts: { staffId: string | "any"; serviceId: string; now?: Date },
): Promise<LocalDate[]> {
  const now = opts.now ?? new Date();
  const rules = effectiveRules(tenant);
  const today = localDateOf(now, tenant.timezone);
  const days: LocalDate[] = [];
  for (let i = 0; i <= rules.horizonDays; i++) {
    const day = addDays(today, i);
    const slots = await availableSlots(db, tenant, { ...opts, day, now });
    if (slots.some((s) => s.starts.length > 0)) days.push(day);
  }
  return days;
}

/** Re-validates a chosen start right before insert (defence in depth; the DB constraint is the last line). */
export async function isSlotBookable(
  db: DbLike,
  tenant: Tenant,
  staffId: string,
  durationMin: number,
  start: Date,
  now = new Date(),
): Promise<boolean> {
  const day = localDateOf(start, tenant.timezone);
  const input = await buildSlotInput(db, tenant, staffId, day, durationMin, now);
  return isStartValid(input, start.getTime());
}

export function compareDays(a: LocalDate, b: LocalDate): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}
