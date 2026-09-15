import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { tenants, users, type Db, type Tenant } from "@arayeshgar/db";
import { isThemeKey } from "@arayeshgar/themes";
import { hashPassword, verifyPassword } from "../auth/password";
import { Errors } from "../errors/domain";
import { bookingRulesSchema, brandingSchema, depositSettingsSchema } from "../tenant/config";

export async function updateDeposit(db: Db, tenantId: string, input: unknown) {
  const d = depositSettingsSchema.parse(input);
  if (d.enabled && !d.cardNumber)
    throw Errors.validation("برای فعال کردن بیعانه، شماره کارت لازم است.");
  if (d.mode === "percent" && d.amount > 100) throw Errors.validation("درصد بیعانه حداکثر ۱۰۰.");
  await db
    .update(tenants)
    .set({ depositSettings: d, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
}

export async function updateRules(db: Db, tenantId: string, input: unknown) {
  const d = bookingRulesSchema.parse(input);
  await db
    .update(tenants)
    .set({ bookingRules: d, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));
}

/** Barber-editable branding (text, contact, colors, faq). Platform-only fields (slug, domain, flags) live elsewhere. */
export async function updateBranding(db: Db, tenant: Tenant, input: unknown) {
  const d = brandingSchema.parse({ ...tenant.branding, ...(input as object) });
  await db
    .update(tenants)
    .set({ branding: d, updatedAt: new Date() })
    .where(eq(tenants.id, tenant.id));
  return d;
}

export async function setTheme(db: Db, tenantId: string, theme: string) {
  // Was a hardcoded three-way list, disconnected from @arayeshgar/themes's own registry --
  // adding a fourth ThemeKey there (night-portrait) did nothing here, so setTheme rejected it
  // as "قالب نامعتبر است" even though the theme itself rendered fine. isThemeKey is the same
  // check apps/web/src/themes/index.tsx uses to pick a renderer, so the two can no longer drift.
  if (!isThemeKey(theme)) throw Errors.validation("قالب نامعتبر است.");
  await db.update(tenants).set({ theme, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
}

export const passwordChange = z.object({
  current: z.string().min(1),
  next: z.string().min(8).max(100),
});
export async function changePassword(
  db: Db,
  userId: string,
  input: z.infer<typeof passwordChange>,
) {
  const d = passwordChange.parse(input);
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u || !verifyPassword(d.current, u.passwordHash))
    throw Errors.validation("رمز فعلی اشتباه است.");
  await db
    .update(users)
    .set({ passwordHash: hashPassword(d.next) })
    .where(eq(users.id, userId));
}

/** One-time 6-digit code the admin types into the bot (/link 123456) to bind their chat for notifications. */
export async function issueBotLinkCode(
  db: Db,
  userId: string,
): Promise<{ code: string; expiresAt: Date }> {
  const code = String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await db
    .update(users)
    .set({ botLinkCode: code, botLinkCodeExpiresAt: expiresAt })
    .where(eq(users.id, userId));
  return { code, expiresAt };
}

/**
 * Called by the bots when a chat sends /link <code>. Returns the linked user or null.
 *
 * A tenant's own admin is matched first, exactly as before. The second lookup exists
 * because a platform admin has `tenant_id = NULL`, and `tenant_id = ?` is never true for
 * NULL in SQL — so before this, an invited salesperson's code could never be found and
 * `/link` was structurally unable to connect them.
 */
export async function consumeBotLinkCode(
  db: Db,
  tenantId: string,
  code: string,
  platform: "telegram" | "bale",
  chatId: number,
) {
  const trimmed = code.trim();
  // `is_active` is part of the match, not a check afterwards: deactivating a row is how
  // the panel revokes an invite, and a revoked code has to stop working there and then.
  let u = await db.query.users.findFirst({
    where: and(
      eq(users.tenantId, tenantId),
      eq(users.botLinkCode, trimmed),
      eq(users.isActive, true),
    ),
  });
  u ??= await db.query.users.findFirst({
    where: and(
      isNull(users.tenantId),
      eq(users.role, "platform_admin"),
      eq(users.botLinkCode, trimmed),
      eq(users.isActive, true),
    ),
  });
  if (!u || !u.botLinkCodeExpiresAt || u.botLinkCodeExpiresAt < new Date()) return null;
  await db
    .update(users)
    .set({
      botLinkCode: null,
      botLinkCodeExpiresAt: null,
      ...(platform === "telegram" ? { telegramChatId: chatId } : { baleChatId: chatId }),
    })
    .where(eq(users.id, u.id));
  return u;
}

export async function unlinkBot(db: Db, userId: string, platform: "telegram" | "bale") {
  await db
    .update(users)
    .set(platform === "telegram" ? { telegramChatId: null } : { baleChatId: null })
    .where(eq(users.id, userId));
}
