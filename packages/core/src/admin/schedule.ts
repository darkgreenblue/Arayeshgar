import { and, asc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { manualSlots, scheduleOverrides, schedules, type Db } from "@arayeshgar/db";
import { Errors, isUniqueViolation } from "../errors/domain";

const minutes = z.number().int().min(0).max(1440);
export const weeklyInput = z.array(
  z
    .object({ weekday: z.number().int().min(0).max(6), startMin: minutes, endMin: minutes })
    .refine((r) => r.endMin > r.startMin, "پایان باید بعد از شروع باشد"),
);
export type WeeklyInput = z.infer<typeof weeklyInput>;

export async function getWeekly(db: Db, staffId: string) {
  return db
    .select()
    .from(schedules)
    .where(eq(schedules.staffId, staffId))
    .orderBy(asc(schedules.weekday), asc(schedules.startMin));
}

/** Replace the whole weekly template for a staff member (simplest mental model for the barber). */
export async function setWeekly(db: Db, tenantId: string, staffId: string, rows: WeeklyInput) {
  const data = weeklyInput.parse(rows);
  // reject overlapping ranges on the same weekday
  for (let i = 0; i < data.length; i++)
    for (let j = i + 1; j < data.length; j++) {
      const a = data[i]!,
        b = data[j]!;
      if (a.weekday === b.weekday && a.startMin < b.endMin && b.startMin < a.endMin)
        throw Errors.validation("بازه‌های یک روز نباید هم‌پوشانی داشته باشند.");
    }
  await db.transaction(async (tx) => {
    await tx.delete(schedules).where(eq(schedules.staffId, staffId));
    if (data.length)
      await tx.insert(schedules).values(data.map((r) => ({ tenantId, staffId, ...r })));
  });
}

export const overrideInput = z
  .object({
    staffId: z.string().uuid(),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kind: z.enum(["closed", "open"]),
    startMin: minutes.nullable().optional(),
    endMin: minutes.nullable().optional(),
    reason: z.string().max(120).optional().nullable(),
  })
  .refine(
    (o) =>
      o.kind === "open"
        ? o.startMin != null && o.endMin != null && o.endMin > o.startMin
        : o.startMin == null || (o.endMin != null && o.endMin > o.startMin),
    "بازه نامعتبر است",
  );
export type OverrideInput = z.infer<typeof overrideInput>;

export async function listOverrides(db: Db, tenantId: string, fromDay: string) {
  return db
    .select()
    .from(scheduleOverrides)
    .where(and(eq(scheduleOverrides.tenantId, tenantId), gte(scheduleOverrides.day, fromDay)))
    .orderBy(asc(scheduleOverrides.day));
}
export async function addOverride(db: Db, tenantId: string, input: OverrideInput) {
  const d = overrideInput.parse(input);
  const [row] = await db
    .insert(scheduleOverrides)
    .values({
      tenantId,
      staffId: d.staffId,
      day: d.day,
      kind: d.kind,
      startMin: d.startMin ?? null,
      endMin: d.endMin ?? null,
      reason: d.reason ?? null,
    })
    .returning();
  return row!;
}
export async function removeOverride(db: Db, tenantId: string, id: string) {
  await db
    .delete(scheduleOverrides)
    .where(and(eq(scheduleOverrides.id, id), eq(scheduleOverrides.tenantId, tenantId)));
}

export const manualSlotInput = z
  .object({
    staffId: z.string().uuid(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
  })
  .refine((s) => new Date(s.endAt) > new Date(s.startAt));
export async function listManualSlots(db: Db, tenantId: string, from: Date) {
  return db
    .select()
    .from(manualSlots)
    .where(and(eq(manualSlots.tenantId, tenantId), gte(manualSlots.startAt, from)))
    .orderBy(asc(manualSlots.startAt));
}
export async function addManualSlot(
  db: Db,
  tenantId: string,
  input: z.infer<typeof manualSlotInput>,
) {
  const d = manualSlotInput.parse(input);
  try {
    const [row] = await db
      .insert(manualSlots)
      .values({
        tenantId,
        staffId: d.staffId,
        startAt: new Date(d.startAt),
        endAt: new Date(d.endAt),
      })
      .returning();
    return row!;
  } catch (err) {
    if (isUniqueViolation(err))
      throw Errors.validation("این بازه با یک اسلات دیگر هم‌پوشانی دارد.");
    throw err;
  }
}
export async function removeManualSlot(db: Db, tenantId: string, id: string) {
  await db
    .delete(manualSlots)
    .where(and(eq(manualSlots.id, id), eq(manualSlots.tenantId, tenantId)));
}
