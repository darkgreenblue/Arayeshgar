/**
 * Receipt upload from a chat: the customer sends a photo while in the "receipt" state.
 * The file is downloaded from the platform (getFile + /file/bot<token>/<path>) and stored with the
 * same storage adapter the website uses, so admins review both in one queue.
 */
import type { Bot } from "grammy";
import type { Db } from "@arayeshgar/db";
import { DomainError, getStorage, logger, submitReceipt } from "@arayeshgar/core";
import { and, eq } from "drizzle-orm";
import { bookings } from "@arayeshgar/db";
import { apiRootFor } from "../platform/capabilities";
import type { BotCtx } from "../platform/bot";
import { clearState, getState } from "./state";
import { matchesShort } from "../platform/callback";

export function registerReceiptFlow(bot: Bot<BotCtx>, db: Db) {
  bot.on("message:photo", async (ctx) => {
    const userId = String(ctx.from?.id);
    const st = await getState(db, ctx.tenant.id, ctx.platform, userId);
    if (st?.await !== "receipt") {
      await ctx.reply(
        "اگر می‌خواهید رسید بفرستید، اول از پیام رزرو دکمه «رسید را می‌فرستم» را بزنید.",
      );
      return;
    }
    // pick the largest photo size the platform offers
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    if (!photo) return;
    try {
      const file = await ctx.api.getFile(photo.file_id);
      if (!file.file_path) throw new Error("no file_path in getFile response");
      const url = `${apiRootFor(ctx.platform)}/file/bot${bot.token}/${file.file_path}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const stored = await getStorage().saveImage(ctx.tenant.id, buf);

      const all = await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.tenantId, ctx.tenant.id), eq(bookings.status, "pending_payment")));
      const target = all.find((b) => matchesShort(b.id, st.b));
      if (!target) {
        await clearState(db, ctx.tenant.id, ctx.platform, userId);
        await ctx.reply(
          "این رزرو دیگر در انتظار پرداخت نیست (شاید مهلتش تمام شده). برای رزرو دوباره /book را بزنید.",
        );
        return;
      }
      await submitReceipt(db, ctx.tenant.id, target.id, { receiptPath: stored.key });
      await clearState(db, ctx.tenant.id, ctx.platform, userId);
      await ctx.reply("🧾 رسید شما دریافت شد. بعد از تأیید آرایشگر، همین‌جا خبر می‌دهیم.");
      logger.info(
        { tenantId: ctx.tenant.id, bookingId: target.id, platform: ctx.platform },
        "receipt received via bot",
      );
    } catch (err) {
      if (err instanceof DomainError) {
        await clearState(db, ctx.tenant.id, ctx.platform, userId);
        await ctx.reply(err.message);
        return;
      }
      logger.error(
        { tenantId: ctx.tenant.id, platform: ctx.platform, err: String(err) },
        "receipt upload failed",
      );
      await ctx.reply("در دریافت رسید مشکلی پیش آمد. لطفاً دوباره بفرستید.");
    }
  });
}
