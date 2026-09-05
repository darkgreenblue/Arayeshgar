import type { Bot } from "grammy";
import type { Db } from "@arayeshgar/db";
import { registerAdminPanel } from "./admin/panel";
import { registerBookingFlow } from "./flows/booking";
import { registerMyFlow } from "./flows/my";
import { registerReceiptFlow } from "./flows/receipt";
import type { BotCtx } from "./platform/bot";

/**
 * Handler order matters: admin callbacks and /my are checked before the booking flow's generic
 * callback handler, and text/photo handlers run last so commands always win.
 */
export function registerAll(bot: Bot<BotCtx>, db: Db) {
  registerAdminPanel(bot, db);
  registerMyFlow(bot, db);
  registerBookingFlow(bot, db);
  registerReceiptFlow(bot, db);
}
