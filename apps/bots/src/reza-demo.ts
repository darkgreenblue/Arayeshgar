/**
 * Makes the named Reza Hosseini demo complete without changing any other tenant.
 *
 * `bootstrap-tenants` intentionally creates from a committed file only once. That is the
 * right default for customers, but it meant later demo corrections (such as enabling the
 * already-configured deposit) never reached a live tenant. This reconciliation is explicit,
 * idempotent, and scoped by the immutable slug instead of "the first demo tenant".
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { tenants, users, type Db } from "@arayeshgar/db";
import { hashPassword, logger } from "@arayeshgar/core";

export const REZA_HOSSEINI_SLUG = "reza-hosseini";

export type RezaDemoResult =
  | { found: false; enabledDeposit: false; linkedAdmins: number }
  | { found: true; enabledDeposit: boolean; linkedAdmins: number };

/**
 * Enables Reza's existing, valid card-to-card deposit and gives every active platform
 * Telegram admin a tenant-scoped manager row. The separate rows are intentional: they make
 * these people notification recipients while their platform-admin rows preserve their global
 * bot access. One Telegram account can therefore book as a customer and review as an admin.
 */
export async function reconcileRezaDemo(db: Db): Promise<RezaDemoResult> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, REZA_HOSSEINI_SLUG),
  });
  if (!tenant) {
    logger.info({ slug: REZA_HOSSEINI_SLUG }, "Reza demo not present; reconciliation skipped");
    return { found: false, enabledDeposit: false, linkedAdmins: 0 };
  }

  // Never turn on a payment step unless the card settings already form a valid, usable offer.
  // This protects a fresh or partially imported database from accepting bookings it cannot charge.
  const deposit = tenant.depositSettings;
  const canCollectDeposit =
    deposit.amount > 0 &&
    typeof deposit.cardNumber === "string" &&
    /^\d{16}$/.test(deposit.cardNumber);
  if (!canCollectDeposit) {
    logger.error(
      { tenantId: tenant.id, slug: tenant.slug },
      "Reza deposit settings incomplete; deposit deliberately left disabled",
    );
    return { found: true, enabledDeposit: false, linkedAdmins: 0 };
  }

  const faq = tenant.branding.faq.map((item) =>
    item.q === "آیا بیعانه لازم است؟"
      ? {
          ...item,
          a: "بله؛ برای قطعی شدن رزرو، بیعانه را کارت‌به‌کارت کنید و رسید را بفرستید. پس از تأیید آرایشگر، نوبت شما قطعی می‌شود.",
        }
      : item,
  );
  const enabledDeposit =
    tenant.features.deposit !== true || tenant.depositSettings.enabled !== true;
  if (enabledDeposit || faq.some((item, index) => item.a !== tenant.branding.faq[index]?.a)) {
    await db
      .update(tenants)
      .set({
        features: { ...tenant.features, deposit: true },
        depositSettings: { ...tenant.depositSettings, enabled: true },
        branding: { ...tenant.branding, faq },
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id));
    logger.info({ tenantId: tenant.id }, "Reza deposit flow enabled");
  }

  const platformAdmins = await db.query.users.findMany({
    where: and(
      isNull(users.tenantId),
      eq(users.role, "platform_admin"),
      eq(users.isActive, true),
      isNotNull(users.telegramChatId),
    ),
  });
  let linkedAdmins = 0;
  for (const platformAdmin of platformAdmins) {
    const chatId = platformAdmin.telegramChatId;
    if (chatId == null) continue;
    const existing = await db.query.users.findFirst({
      where: and(eq(users.tenantId, tenant.id), eq(users.telegramChatId, chatId)),
    });
    if (existing) {
      if (!existing.isActive) {
        await db.update(users).set({ isActive: true }).where(eq(users.id, existing.id));
      }
      linkedAdmins++;
      continue;
    }
    await db.insert(users).values({
      id: randomUUID(),
      tenantId: tenant.id,
      role: "manager",
      username: `demo-tg-${chatId}`,
      // This row exists solely as the tenant notification identity. It cannot be used to log in.
      passwordHash: hashPassword(randomUUID()),
      displayName: platformAdmin.displayName,
      telegramChatId: chatId,
      isActive: true,
    });
    linkedAdmins++;
  }
  logger.info({ tenantId: tenant.id, linkedAdmins }, "Reza demo Telegram admins reconciled");
  return { found: true, enabledDeposit: true, linkedAdmins };
}
