/**
 * Telegram/Bale's native "/" command menu (setMyCommands). Every command listed here already
 * existed and worked -- see flows/my.ts and admin/panel.ts -- customers and admins just had no
 * way to discover them short of being told the exact string to type. Nothing in this codebase
 * called setMyCommands before this file.
 *
 * Two menus:
 *  - the default one (BotCommandScopeDefault, i.e. every private chat) -- customer commands only.
 *    /link and /invite deliberately stay out of it: an ordinary customer never needs either, and
 *    both flows already hand the exact command text to whoever does need them.
 *  - a per-chat menu (BotCommandScopeChat) for chats that already resolve as an admin -- adds
 *    /admin, and /invite for platform admins. Applied the moment a chat links (see admin/panel.ts)
 *    and backfilled at boot for chats that linked before this file existed.
 */
import type { Bot } from "grammy";
import { and, eq, isNull, or } from "drizzle-orm";
import { users, type Db, type Platform } from "@arayeshgar/db";
import { logger } from "@arayeshgar/core";
import type { BotCtx } from "./bot";

const CUSTOMER_COMMANDS = [
  { command: "book", description: "رزرو نوبت جدید" },
  { command: "my", description: "رزروهای من" },
  { command: "help", description: "راهنما" },
];

const ADMIN_EXTRA_COMMANDS = [
  { command: "admin", description: "پنل مدیریت" },
  { command: "invite", description: "دعوت ادمین پلتفرم" },
];

/** A failed setMyCommands must never break bot boot or a chat's /link -- the menu just stays as-is. */
async function safeSetMyCommands(
  bot: Bot<BotCtx>,
  commands: { command: string; description: string }[],
  chatId?: number,
): Promise<void> {
  try {
    await bot.api.setMyCommands(
      commands,
      chatId == null ? undefined : { scope: { type: "chat", chat_id: chatId } },
    );
  } catch (err) {
    logger.debug({ err: String(err), chatId }, "setMyCommands failed; menu left unchanged");
  }
}

export function publishDefaultCommands(bot: Bot<BotCtx>): Promise<void> {
  return safeSetMyCommands(bot, CUSTOMER_COMMANDS);
}

/** Call the moment a chat is known to be an admin -- right after /link succeeds. */
export function publishAdminCommands(bot: Bot<BotCtx>, chatId: number): Promise<void> {
  return safeSetMyCommands(bot, [...CUSTOMER_COMMANDS, ...ADMIN_EXTRA_COMMANDS], chatId);
}

/**
 * Chats that already act as an admin here but linked before this file existed. For a
 * tenant's own bot: that tenant's active admins plus every platform admin (their
 * `tenant_id` is NULL -- see adminUser() in admin/panel.ts for why that needs its own
 * clause). For the shared demo bot (no single tenant), omit `tenantId` to backfill just
 * platform admins, since a demo tenant's own staff have no bot of their own to link yet.
 * Best-effort per chat: one bad id must not stop the rest from getting their menu.
 */
export async function backfillAdminCommands(
  bot: Bot<BotCtx>,
  db: Db,
  platform: Platform,
  tenantId?: string,
): Promise<void> {
  try {
    const col = platform === "telegram" ? users.telegramChatId : users.baleChatId;
    const where = tenantId
      ? and(eq(users.isActive, true), or(eq(users.tenantId, tenantId), isNull(users.tenantId)))
      : and(eq(users.isActive, true), isNull(users.tenantId));
    const rows = await db.select({ chatId: col }).from(users).where(where);
    for (const row of rows) {
      if (row.chatId != null) await publishAdminCommands(bot, row.chatId);
    }
  } catch (err) {
    logger.debug({ err: String(err), tenantId, platform }, "admin command backfill failed");
  }
}
