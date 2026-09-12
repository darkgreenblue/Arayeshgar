/**
 * Admin commands inside the bot. This is the barber's "notification + one-tap approval" surface;
 * anything heavier (prices, branding, schedule editing) stays on the web panel.
 *
 * A chat becomes an admin chat by sending /link <code>, where the code is issued in the web panel.
 */
import { and, asc, eq, gte, inArray, lt, or } from "drizzle-orm";
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  bookings,
  customers,
  payments,
  services,
  staff,
  users,
  type Db,
  type User,
} from "@arayeshgar/db";
import {
  addDays,
  approveReceipt,
  can,
  cancelByAdmin,
  confirmBooking,
  consumeBotLinkCode,
  DomainError,
  findPlatformAdminByChat,
  formatInstantFa,
  invitePlatformAdmin,
  formatIranMobile,
  formatToman,
  loadBookingContext,
  localDateOf,
  localToInstant,
  logger,
  rejectReceipt,
  STATUS_LABELS_FA,
  toPersianDigits,
  visibleStaffIds,
} from "@arayeshgar/core";
import { decode, encode, matchesShort, shortId } from "../platform/callback";
import { replyOrEdit, safeAnswerCallback, type BotCtx } from "../platform/bot";

export function registerAdminPanel(bot: Bot<BotCtx>, db: Db) {
  bot.command("link", async (ctx) => {
    const code = (ctx.match ?? "").trim();
    if (!/^\d{6}$/.test(code))
      return void (await ctx.reply(
        "کد اتصال ۶ رقمی را بفرستید. نمونه:\n/link 123456\n\nکد را از پنل وب ← تنظیمات ← اتصال ربات بگیرید.",
      ));
    const chatId = ctx.chat?.id;
    if (chatId == null) return;
    const u = await consumeBotLinkCode(db, ctx.tenant.id, code, ctx.platform, chatId);
    if (!u) return void (await ctx.reply("کد نامعتبر یا منقضی است. از پنل کد تازه بگیرید."));
    logger.info(
      { tenantId: ctx.tenant.id, userId: u.id, platform: ctx.platform },
      "admin chat linked",
    );
    await ctx.reply(
      `✅ متصل شد، ${u.displayName} عزیز.\nاز این پس رزروها و رسیدهای جدید همین‌جا برایتان می‌آید.\n\n/admin — پنل مدیریت`,
    );
  });

  /**
   * Invites another platform admin — a salesperson, in practice.
   *
   * Deliberately does NOT ask for the invitee's numeric Telegram id. Getting that out of
   * a non-technical person is the step that makes `Ops → admin-add` awkward; a code they
   * paste into any of our bots skips it entirely.
   */
  bot.command("invite", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId == null) return;
    const me = await findPlatformAdminByChat(db, ctx.platform, chatId);
    // Only a platform admin may create one. A tenant's own owner must not be able to
    // mint an account that can see every barber on the server.
    if (!me) return void (await ctx.reply("این دستور فقط برای ادمین‌های پلتفرم است."));

    const name = (ctx.match ?? "").trim();
    const invite = await invitePlatformAdmin(db, { invitedBy: me.id, displayName: name });
    logger.info({ invitedBy: me.id, userId: invite.userId }, "platform admin invite issued");
    await ctx.reply(
      [
        `کد دعوت ${name ? `«${name}»` : ""} ساخته شد:`,
        "",
        `<code>${invite.code}</code>`,
        "",
        `این پیام را برایش بفرستید. او باید در ربات بنویسد:\n<code>/link ${invite.code}</code>`,
        "",
        "کد یک ساعت اعتبار دارد و فقط یک بار کار می‌کند.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  bot.command("admin", async (ctx) => {
    const admin = await adminUser(db, ctx);
    if (!admin)
      return void (await ctx.reply(
        "این چت به هیچ حساب مدیری وصل نیست. از پنل وب کد بگیرید و /link <کد> را بفرستید.",
      ));
    await ctx.reply(`پنل «${ctx.tenant.branding.displayName}»`, { reply_markup: adminKeyboard() });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const cb = decode(ctx.callbackQuery.data);
    if (!cb || (cb.a !== "adm" && cb.a !== "approve" && cb.a !== "reject")) return next();
    const admin = await adminUser(db, ctx);
    if (!admin) {
      await safeAnswerCallback(ctx, "دسترسی ندارید");
      return;
    }
    await safeAnswerCallback(ctx);
    if (cb.a === "adm") {
      if (cb.v === "close")
        return void (await replyOrEdit(ctx, "بسته شد. /admin برای باز کردن دوباره."));
      if (cb.v === "pending") return void (await showPending(ctx, db, admin));
      return void (await showDay(ctx, db, admin, cb.v === "today" ? 0 : 1));
    }
    await review(ctx, db, admin, cb.a, cb.b);
  });
}

const adminKeyboard = () =>
  new InlineKeyboard()
    .text("📅 امروز", encode({ a: "adm", v: "today" }))
    .text("📅 فردا", encode({ a: "adm", v: "tomorrow" }))
    .row()
    .text("🧾 در انتظار تأیید", encode({ a: "adm", v: "pending" }))
    .row()
    .text("بستن", encode({ a: "adm", v: "close" }));

/**
 * Who is speaking, as far as admin rights go.
 *
 * The tenant's own admins come first. The fallback is what lets the owner and the
 * salespeople work in any barber's chat: their `tenant_id` is NULL, so the query above
 * can never match them — `tenant_id = ?` is false for NULL — and without this they were
 * strangers to every bot despite being platform admins in the database.
 *
 * Nothing downstream needs to know the difference: `can()` already grants platform_admin
 * everything and `visibleStaffIds` already returns "all staff" for them.
 */
async function adminUser(db: Db, ctx: BotCtx): Promise<User | null> {
  const chatId = ctx.chat?.id;
  if (chatId == null) return null;
  const col = ctx.platform === "telegram" ? users.telegramChatId : users.baleChatId;
  const u = await db.query.users.findFirst({
    where: and(eq(users.tenantId, ctx.tenant.id), eq(col, chatId), eq(users.isActive, true)),
  });
  return u ?? (await findPlatformAdminByChat(db, ctx.platform, chatId));
}

function staffFilter(admin: User, ctx: BotCtx) {
  const ids = visibleStaffIds(admin, ctx.tenant);
  return ids === null
    ? undefined
    : inArray(bookings.staffId, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
}

async function showDay(ctx: BotCtx, db: Db, admin: User, offset: number) {
  const tz = ctx.tenant.timezone;
  const day = addDays(localDateOf(new Date(), tz), offset);
  const rows = await db
    .select({ booking: bookings, customer: customers, service: services, staff })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .where(
      and(
        eq(bookings.tenantId, ctx.tenant.id),
        gte(bookings.startAt, localToInstant(day, 0, tz)),
        lt(bookings.startAt, localToInstant(addDays(day, 1), 0, tz)),
        inArray(bookings.status, [
          "confirmed",
          "pending_payment",
          "receipt_submitted",
          "pending_approval",
        ]),
        staffFilter(admin, ctx),
      ),
    )
    .orderBy(asc(bookings.startAt));
  const title = offset === 0 ? "📅 نوبت‌های امروز" : "📅 نوبت‌های فردا";
  if (!rows.length)
    return void (await replyOrEdit(ctx, `${title}\n\nنوبتی ثبت نشده.`, adminKeyboard()));
  const body = rows
    .map((r) => {
      const time = formatInstantFa(r.booking.startAt, ctx.tenant.timezone).split("ساعت ")[1];
      return `${time} · ${r.customer.name} (${formatIranMobile(r.customer.phone)}) · ${r.service.name}${ctx.tenant.mode !== "solo" ? ` · ${r.staff.name}` : ""} · ${STATUS_LABELS_FA[r.booking.status]}`;
    })
    .join("\n");
  await replyOrEdit(ctx, `${title} (${toPersianDigits(rows.length)})\n\n${body}`, adminKeyboard());
}

async function showPending(ctx: BotCtx, db: Db, admin: User) {
  const rows = await db
    .select({ booking: bookings, customer: customers, service: services, payment: payments })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(payments, eq(payments.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.tenantId, ctx.tenant.id),
        inArray(bookings.status, ["receipt_submitted", "pending_approval"]),
        staffFilter(admin, ctx),
      ),
    )
    .orderBy(asc(bookings.startAt))
    .limit(10);
  if (!rows.length)
    return void (await replyOrEdit(ctx, "🧾 چیزی در انتظار تأیید نیست ✅", adminKeyboard()));
  await replyOrEdit(ctx, `🧾 ${toPersianDigits(rows.length)} مورد در انتظار تأیید:`);
  for (const r of rows) {
    const kb = new InlineKeyboard()
      .text("✅ تأیید", encode({ a: "approve", b: shortId(r.booking.id) }))
      .text("❌ رد", encode({ a: "reject", b: shortId(r.booking.id) }));
    const lines = [
      `${r.customer.name} (${formatIranMobile(r.customer.phone)})`,
      `${r.service.name} · ${formatInstantFa(r.booking.startAt, ctx.tenant.timezone)}`,
      r.booking.depositAmount > 0
        ? `بیعانه: ${formatToman(r.booking.depositAmount)}`
        : "بدون بیعانه",
      `کد: ${r.booking.code}`,
    ];
    await ctx.reply(lines.join("\n"), { reply_markup: kb });
  }
}

async function review(
  ctx: BotCtx,
  db: Db,
  admin: User,
  action: "approve" | "reject",
  short: string,
) {
  const rows = await db
    .select({ id: bookings.id, staffId: bookings.staffId, status: bookings.status })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, ctx.tenant.id),
        or(eq(bookings.status, "receipt_submitted"), eq(bookings.status, "pending_approval")),
      ),
    );
  const target = rows.find((b) => matchesShort(b.id, short));
  if (!target) return void (await replyOrEdit(ctx, "این مورد قبلاً بررسی شده است."));
  if (!can(admin, "review_receipt", { tenant: ctx.tenant, staffId: target.staffId })) {
    return void (await replyOrEdit(ctx, "شما اجازه بررسی این رزرو را ندارید."));
  }
  try {
    if (action === "approve") {
      const after =
        target.status === "pending_approval"
          ? await confirmBooking(db, ctx.tenant.id, target.id, admin.id)
          : await approveReceipt(db, ctx.tenant.id, target.id, admin.id);
      await replyOrEdit(ctx, `✅ تأیید شد — ${after.customer.name}، کد ${after.booking.code}`);
    } else {
      const after = await rejectReceipt(
        db,
        ctx.tenant.id,
        target.id,
        admin.id,
        "رد شده توسط آرایشگر",
      );
      await replyOrEdit(
        ctx,
        `❌ رد شد — ${after.customer.name}، کد ${after.booking.code}. وقت آزاد شد.`,
      );
    }
  } catch (err) {
    await replyOrEdit(
      ctx,
      err instanceof DomainError ? err.message : "انجام نشد؛ دوباره تلاش کنید.",
    );
  }
}

/** Used by the notification sender for admin messages that carry approve/reject buttons. */
export async function adminCanReview(
  db: Db,
  tenantId: string,
  chatId: string,
  platform: BotCtx["platform"],
) {
  const col = platform === "telegram" ? users.telegramChatId : users.baleChatId;
  const u = await db.query.users.findFirst({
    where: and(eq(users.tenantId, tenantId), eq(col, Number(chatId))),
  });
  return u ?? null;
}

export { loadBookingContext, cancelByAdmin };
