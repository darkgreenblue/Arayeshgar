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
import { and, eq, isNull } from "drizzle-orm";
import { users, type Db, type Platform, type User } from "@arayeshgar/db";
import { logger } from "../logger";

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
  logger.info({ userId, invitedBy: input.invitedBy }, "platform admin invited");
  return { code, expiresAt, userId, username };
}
