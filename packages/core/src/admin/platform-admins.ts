/**
 * Platform admins — the owner and the salespeople.
 *
 * They are data, not configuration: adding or removing one must take seconds and no
 * deploy. That works only if two things hold, and neither did before this file existed.
 *
 * **You cannot lock yourself out.** `Ops → admin-remove` can deactivate any row, your
 * own included, and `db-query` is deliberately read-only — so a mistake there left no way
 * back in. `ensurePlatformAdmins` runs at boot and restores every id in ADMIN_IDS, which
 * is what makes that mistake survivable. After boot the database is the only authority;
 * nothing consults the environment to decide access.
 *
 * **A platform admin is recognisable inside a bot.** Their `tenant_id` is NULL, and SQL
 * equality against NULL is never true, so every tenant-scoped lookup silently skipped
 * them: they could exist as a row and still be a stranger to every bot chat.
 */
import { randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { auditLog, users, type Db, type Platform, type User } from "@arayeshgar/db";
import { Errors } from "../errors/domain";
import { logger } from "../logger";

/**
 * Every change to the admin roster is recorded under the acting admin's own name. The
 * tenant column stays NULL because these people belong to the platform, not a barber.
 */
async function audit(
  db: Db,
  actorId: string,
  action: string,
  targetUserId: string,
  data?: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    tenantId: null,
    actorType: "user",
    actorId,
    action,
    entity: "platform_admin",
    entityId: targetUserId,
    data,
  });
}

/** Reads a comma- or space-separated list of numeric Telegram ids, ignoring junk. */
export function parseAdminIds(raw: string | undefined | null): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  for (const piece of raw.split(/[,\s]+/)) {
    if (!/^\d+$/.test(piece)) continue;
    const n = Number(piece);
    if (Number.isSafeInteger(n) && n > 0) seen.add(n);
  }
  return [...seen];
}

export type BootstrapResult = {
  created: number[];
  restored: number[];
  unchanged: number[];
};

/**
 * Makes sure every id in `ids` is an active platform admin. Idempotent, and safe to run
 * on every boot: an id that is already right is left alone.
 *
 * This is the one place the environment may influence access, and only in the direction
 * of granting it back — so a wrong `admin-remove` costs a restart, not the account.
 */
export async function ensurePlatformAdmins(db: Db, ids: number[]): Promise<BootstrapResult> {
  const out: BootstrapResult = { created: [], restored: [], unchanged: [] };
  for (const telegramId of ids) {
    try {
      const existing = await db.query.users.findFirst({
        where: eq(users.telegramChatId, telegramId),
      });
      if (!existing) {
        await db.insert(users).values({
          id: randomUUID(),
          tenantId: null,
          role: "platform_admin",
          username: `tg${telegramId}`,
          // Empty rather than a random secret: this account has no web password until
          // its owner sets one, and an unusable hash is clearer than a lost one.
          passwordHash: "",
          displayName: `ادمین ${telegramId}`,
          telegramChatId: telegramId,
          isActive: true,
        });
        out.created.push(telegramId);
        continue;
      }
      const correct =
        existing.role === "platform_admin" && existing.tenantId === null && existing.isActive;
      if (correct) {
        out.unchanged.push(telegramId);
        continue;
      }
      await db
        .update(users)
        .set({ role: "platform_admin", tenantId: null, isActive: true })
        .where(eq(users.id, existing.id));
      out.restored.push(telegramId);
    } catch (err) {
      // One bad id must not stop the others, and must never stop the process booting.
      logger.error({ telegramId, err: String(err) }, "platform admin bootstrap failed for one id");
    }
  }
  if (out.created.length || out.restored.length) {
    logger.info(
      { created: out.created, restored: out.restored, unchanged: out.unchanged.length },
      "platform admins bootstrapped",
    );
  }
  return out;
}

/** The active platform admin owning this chat, if any. Deliberately tenant-independent. */
export async function findPlatformAdminByChat(
  db: Db,
  platform: Platform,
  chatId: number,
): Promise<User | null> {
  const col = platform === "telegram" ? users.telegramChatId : users.baleChatId;
  const u = await db.query.users.findFirst({
    where: and(
      isNull(users.tenantId),
      eq(users.role, "platform_admin"),
      eq(col, chatId),
      eq(users.isActive, true),
    ),
  });
  return u ?? null;
}

/** One row of the «ادمین‌ها» page. `pendingInvite` is set until the person sends /link. */
export type PlatformAdminRow = {
  id: string;
  displayName: string;
  username: string;
  telegramChatId: number | null;
  baleChatId: number | null;
  isActive: boolean;
  createdAt: Date;
  pendingInvite: { code: string; expiresAt: Date; expired: boolean } | null;
};

/**
 * The whole roster, inactive rows included — a deactivated admin has to stay visible or
 * the page silently loses the audit trail of who used to have access.
 *
 * The invite code is shown to whoever opens the page. That is deliberate: an unsent or
 * mislaid code can then be resent instead of regenerated, and every platform admin is a
 * full peer of every other one (owner's decision), so seeing it grants nothing new.
 */
export async function listPlatformAdmins(db: Db): Promise<PlatformAdminRow[]> {
  const rows = await db.query.users.findMany({
    where: and(isNull(users.tenantId), eq(users.role, "platform_admin")),
    orderBy: [desc(users.createdAt)],
  });
  const now = Date.now();
  return rows.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    username: u.username,
    telegramChatId: u.telegramChatId,
    baleChatId: u.baleChatId,
    isActive: u.isActive,
    createdAt: u.createdAt,
    pendingInvite: u.botLinkCode
      ? {
          code: u.botLinkCode,
          expiresAt: u.botLinkCodeExpiresAt ?? new Date(0),
          expired: (u.botLinkCodeExpiresAt?.getTime() ?? 0) <= now,
        }
      : null,
  }));
}

/**
 * Adds (or restores) one platform admin from a numeric Telegram id — the same thing
 * `Ops → admin-add` does, so the panel and the workflow can never drift apart.
 */
export async function addPlatformAdminByTelegramId(
  db: Db,
  input: { telegramId: number; displayName?: string; actorId: string },
): Promise<{ user: User; created: boolean }> {
  const { telegramId, actorId } = input;
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    throw Errors.validation("آی‌دی تلگرام باید یک عدد صحیح مثبت باشد.");
  }
  const displayName = input.displayName?.trim().slice(0, 80) || `ادمین ${telegramId}`;
  const existing = await db.query.users.findFirst({
    where: eq(users.telegramChatId, telegramId),
  });

  if (existing) {
    await db
      .update(users)
      .set({ role: "platform_admin", tenantId: null, isActive: true })
      .where(eq(users.id, existing.id));
    await audit(db, actorId, "platform_admin.restore", existing.id, { telegramId });
    const user = (await db.query.users.findFirst({ where: eq(users.id, existing.id) }))!;
    return { user, created: false };
  }

  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    tenantId: null,
    role: "platform_admin",
    username: `tg${telegramId}`,
    // No web password until its owner sets one; an unusable hash beats a lost one.
    passwordHash: "",
    displayName,
    telegramChatId: telegramId,
    isActive: true,
  });
  await audit(db, actorId, "platform_admin.add", userId, { telegramId });
  const user = (await db.query.users.findFirst({ where: eq(users.id, userId) }))!;
  return { user, created: true };
}

/**
 * Turns one platform admin off or back on. Deactivating also burns any unused invite code,
 * so revoking an invite that went to the wrong person actually stops it working.
 *
 * **Why you cannot lock everyone out here.** Two guards, and the first one alone is
 * enough: you may not deactivate yourself, and you are active by definition while acting —
 * so at least one active admin always survives. The second guard (never leave zero) is the
 * belt to that braces, for a caller that hands in an actor who is not on the roster.
 */
export async function setPlatformAdminActive(
  db: Db,
  input: { userId: string; isActive: boolean; actorId: string },
): Promise<User> {
  const { userId, isActive, actorId } = input;
  const target = await db.query.users.findFirst({
    where: and(isNull(users.tenantId), eq(users.role, "platform_admin"), eq(users.id, userId)),
  });
  if (!target) throw Errors.notFound("ادمین");

  if (!isActive) {
    if (userId === actorId) {
      throw Errors.validation(
        "نمی‌توانید حساب خودتان را غیرفعال کنید. از یک ادمین دیگر بخواهید این کار را بکند.",
      );
    }
    const others = await db.query.users.findMany({
      where: and(
        isNull(users.tenantId),
        eq(users.role, "platform_admin"),
        eq(users.isActive, true),
        ne(users.id, userId),
      ),
    });
    if (others.length === 0) {
      throw Errors.validation("این تنها ادمین فعال است؛ اول یک ادمین دیگر اضافه کنید.");
    }
  }

  await db
    .update(users)
    .set(
      isActive
        ? { isActive: true }
        : { isActive: false, botLinkCode: null, botLinkCodeExpiresAt: null },
    )
    .where(eq(users.id, userId));
  await audit(
    db,
    actorId,
    isActive ? "platform_admin.reactivate" : "platform_admin.deactivate",
    userId,
    { displayName: target.displayName },
  );
  return (await db.query.users.findFirst({ where: eq(users.id, userId) }))!;
}

export type Invitation = { code: string; expiresAt: Date; userId: string; username: string };

/**
 * Creates a pending platform admin and a one-time code for them.
 *
 * The point is that the invitee's numeric Telegram id is never needed: getting it out of
 * a non-technical salesperson is the step that actually makes `admin-add` awkward. They
 * send `/link <code>` to any of our bots and the code fills in their chat id.
 */
export async function invitePlatformAdmin(
  db: Db,
  input: { invitedBy: string; displayName?: string },
): Promise<Invitation> {
  const code = String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 60 * 60_000); // an hour: this is sent over chat
  const userId = randomUUID();
  const username = `invite_${randomUUID().slice(0, 8)}`;
  await db.insert(users).values({
    id: userId,
    tenantId: null,
    role: "platform_admin",
    username,
    passwordHash: "",
    displayName: input.displayName?.slice(0, 80) || "ادمین دعوت‌شده",
    botLinkCode: code,
    botLinkCodeExpiresAt: expiresAt,
    isActive: true,
  });
  await audit(db, input.invitedBy, "platform_admin.invite", userId, {
    displayName: input.displayName?.slice(0, 80) ?? null,
  });
  logger.info({ userId, invitedBy: input.invitedBy }, "platform admin invited");
  return { code, expiresAt, userId, username };
}
