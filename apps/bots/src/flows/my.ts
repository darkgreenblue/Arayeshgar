/**
 * /my — the customer's own bookings in this chat. Mirrors the website's /b/{code} page.
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Bot } from "grammy";
import { bookings, customerIdentities, customers, services, staff, type Db } from "@arayeshgar/db";
import {
  cancelByCustomer,
  DomainError,
  effectiveRules,
  formatInstantFa,
  isEnabled,
  STATUS_LABELS_FA,
  toPersianDigits,
} from "@arayeshgar/core";
import { isolate } from "@arayeshgar/core/utils/phone";
import { decode, encode, matchesShort } from "../platform/callback";
import { replyOrEdit, safeAnswerCallback, type BotCtx } from "../platform/bot";
import { InlineKeyboard } from "grammy";

export function registerMyFlow(bot: Bot<BotCtx>, db: Db) {
  bot.command("my", async (ctx) => {
    const rows = await myBookings(db, ctx);
    if (!rows.length) return void (await ctx.reply("رزرو فعالی ندارید. برای رزرو /book را بزنید."));
    const rules = effectiveRules(ctx.tenant);
    for (const r of rows) {
      const canCancel =
        isEnabled(ctx.tenant, "customer_cancel") &&
        r.booking.startAt.getTime() - Date.now() >= rules.cancelBeforeHours * 3_600_000;
      const kb = new InlineKeyboard();
      if (canCancel) kb.text("لغو این نوبت", encode({ a: "cancel", b: shortOf(r.booking.id) }));
      await ctx.reply(
        [
          `کد رزرو: ${isolate(r.booking.code)}`,
          `خدمت: ${r.service.name}`,
          ctx.tenant.mode !== "solo" ? `آرایشگر: ${r.staff.name}` : "",
          `زمان: ${formatInstantFa(r.booking.startAt, ctx.tenant.timezone)}`,
          `وضعیت: ${STATUS_LABELS_FA[r.booking.status]}`,
        ]
          .filter(Boolean)
          .join("\n"),
        canCancel ? { reply_markup: kb } : {},
      );
    }
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const cb = decode(ctx.callbackQuery.data);
    if (cb?.a !== "cancel") return next();
    await safeAnswerCallback(ctx);
    const rows = await myBookings(db, ctx);
    const target = rows.find((r) => matchesShort(r.booking.id, cb.b));
    if (!target) return void (await replyOrEdit(ctx, "این رزرو پیدا نشد."));
    try {
      await cancelByCustomer(db, ctx.tenant.id, target.booking.id);
      await replyOrEdit(
        ctx,
        `رزرو ${isolate(target.booking.code)} لغو شد. برای رزرو جدید /book را بزنید.`,
      );
    } catch (err) {
      await replyOrEdit(ctx, err instanceof DomainError ? err.message : "لغو ممکن نشد.");
    }
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        `راهنمای ربات «${ctx.tenant.branding.displayName}»`,
        "",
        "/book — رزرو وقت",
        "/my — رزروهای من",
        `/help — همین راهنما`,
        ctx.tenant.branding.phone ? `تماس: ${toPersianDigits(ctx.tenant.branding.phone)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  });
}

function shortOf(uuid: string) {
  return uuid.replace(/-/g, "").slice(0, 8);
}

async function myBookings(db: Db, ctx: BotCtx) {
  const userId = String(ctx.from?.id);
  return db
    .select({ booking: bookings, service: services, staff })
    .from(customerIdentities)
    .innerJoin(customers, eq(customers.id, customerIdentities.customerId))
    .innerJoin(bookings, eq(bookings.customerId, customers.id))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .where(
      and(
        eq(customerIdentities.tenantId, ctx.tenant.id),
        eq(customerIdentities.platform, ctx.platform),
        eq(customerIdentities.platformUserId, userId),
        gte(bookings.startAt, new Date(Date.now() - 6 * 3_600_000)),
        inArray(bookings.status, [
          "pending_payment",
          "receipt_submitted",
          "pending_approval",
          "confirmed",
        ]),
      ),
    )
    .orderBy(desc(bookings.startAt))
    .limit(10);
}
