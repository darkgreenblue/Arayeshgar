import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { staff, users, type Db } from "@arayeshgar/db";
import { hashPassword } from "../auth/password";
import { Errors, pgErrorCode } from "../errors/domain";

export const staffInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(60),
  bio: z.string().max(300).optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
  depositSettings: z
    .object({
      cardNumber: z
        .string()
        .regex(/^\d{16}$/)
        .optional(),
      cardHolder: z.string().max(80).optional(),
      bankName: z.string().max(40).optional(),
    })
    .optional()
    .nullable(),
});
export type StaffInput = z.infer<typeof staffInput>;

export async function listStaff(db: Db, tenantId: string) {
  const rows = await db
    .select()
    .from(staff)
    .where(eq(staff.tenantId, tenantId))
    .orderBy(asc(staff.sortOrder), asc(staff.name));
  const logins = await db
    .select({ id: users.id, staffId: users.staffId, username: users.username, role: users.role })
    .from(users)
    .where(eq(users.tenantId, tenantId));
  return rows.map((s) => ({
    ...s,
    login: logins.find((l) => l.staffId === s.id && l.role === "staff") ?? null,
  }));
}

export async function upsertStaff(db: Db, tenantId: string, input: StaffInput) {
  const d = staffInput.parse(input);
  const values = {
    name: d.name,
    bio: d.bio ?? null,
    photoUrl: d.photoUrl ?? null,
    sortOrder: d.sortOrder,
    isActive: d.isActive,
    depositSettings: d.depositSettings ?? null,
  };
  if (d.id) {
    const [row] = await db
      .update(staff)
      .set(values)
      .where(and(eq(staff.id, d.id), eq(staff.tenantId, tenantId)))
      .returning();
    if (!row) throw Errors.notFound("آرایشگر");
    return row;
  }
  const [row] = await db
    .insert(staff)
    .values({ tenantId, ...values })
    .returning();
  return row!;
}

/** salon_independent: give a barber their own login scoped to their calendar. */
export async function setStaffLogin(
  db: Db,
  tenantId: string,
  staffId: string,
  username: string,
  password: string,
) {
  const u = username.trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,30}$/.test(u))
    throw Errors.validation("نام کاربری فقط حروف انگلیسی، عدد، نقطه و زیرخط (۳ تا ۳۰ کاراکتر).");
  if (password.length < 8) throw Errors.validation("رمز حداقل ۸ کاراکتر.");
  const [s] = await db
    .select({ name: staff.name })
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.tenantId, tenantId)));
  if (!s) throw Errors.notFound("آرایشگر");
  const existing = await db.query.users.findFirst({
    where: and(eq(users.tenantId, tenantId), eq(users.staffId, staffId), eq(users.role, "staff")),
  });
  try {
    if (existing) {
      await db
        .update(users)
        .set({ username: u, passwordHash: hashPassword(password), isActive: true })
        .where(eq(users.id, existing.id));
      return existing.id;
    }
    const [row] = await db
      .insert(users)
      .values({
        tenantId,
        role: "staff",
        staffId,
        username: u,
        passwordHash: hashPassword(password),
        displayName: s.name,
      })
      .returning({ id: users.id });
    return row!.id;
  } catch (err) {
    if (pgErrorCode(err) === "23505")
      throw Errors.validation("این نام کاربری قبلاً استفاده شده است.");
    throw err;
  }
}
