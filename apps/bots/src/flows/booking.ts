/**
 * Customer booking flow — the same four steps as the website, driven entirely by callback_data
 * so no server-side conversation state is needed until the phone number or the receipt photo.
 *
 * service → (staff) → day → time → phone → (deposit instructions)
 */
import { and, eq } from "drizzle-orm";
import type { Bot } from "grammy";
import { services, staff as staffTable, type Db, type Tenant } from "@arayeshgar/db";
import {
  availableDays,
  availableSlots,
  createBooking,
  findCustomerByIdentity,
  formatJalaliLong,
  formatMinutes,
  formatToman,
  jalaliKey,
  localDateOf,
  logger,
  normalizeIranMobile,
  parseJalaliKey,
  renderNotification,
  toLocal,
  DomainError,
  type BookingPayload,
} from "@arayeshgar/core";
import { getEnv, tenantPublicUrl } from "@arayeshgar/core";
import { isolate } from "@arayeshgar/core/utils/phone";
import {
  decode,
  encode,
  matchesShort,
  packTime,
  shortId,
  unpackTime,
  type Callback,
} from "../platform/callback";
import { replyOrEdit, safeAnswerCallback, type BotCtx } from "../platform/bot";
import { contactKeyboard, grid, removeKeyboard, toInlineKeyboard } from "../platform/keyboard";
import { clearState, getState, setState } from "./state";

const ANY = "any";

export function registerBookingFlow(bot: Bot<BotCtx>, db: Db) {
  bot.command("start", async (ctx) => {
    await ctx.reply(welcome(ctx.tenant), { reply_markup: await serviceKeyboard(db, ctx.tenant) });
  });
  bot.command("book", async (ctx) => {
    await ctx.reply("چه خدمتی می‌خواهید؟", { reply_markup: await serviceKeyboard(db, ctx.tenant) });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const cb = decode(ctx.callbackQuery.data);
    if (!cb) return next();
    switch (cb.a) {
      case "svc":
        return void (await onService(ctx, db, cb));
      case "stf":
        return void (await onStaff(ctx, db, cb));
      case "day":
        return void (await onDay(ctx, db, cb));
      case "slot":
        return void (await onSlot(ctx, db, cb));
      case "back":
        return void (await onBack(ctx, db, cb));
      case "receipt":
        return void (await onReceiptRequested(ctx, db, cb));
      case "noop":
        return void (await safeAnswerCallback(ctx));
      default:
        return next();
    }
  });

  // Phone number, typed or shared via the contact button.
  bot.on("message:contact", async (ctx) => {
    const phone = ctx.message.contact.phone_number;
    await completeWithPhone(ctx, db, phone);
  });
  bot.on("message:text", async (ctx, next) => {
    const st = await getState(db, ctx.tenant.id, ctx.platform, String(ctx.from?.id));
    if (st?.await !== "phone") return next();
    await completeWithPhone(ctx, db, ctx.message.text);
  });
}

function welcome(tenant: Tenant): string {
  const b = tenant.branding;
  return [
    `سلام 👋`,
    `به ربات رزرو «${b.displayName}» خوش آمدید.`,
    b.tagline ?? "",
    "",
    "برای شروع، خدمت مورد نظر را انتخاب کنید:",
  ]
    .filter(Boolean)
    .join("\n");
}

async function serviceKeyboard(db: Db, tenant: Tenant) {
  const rows = await db
    .select({
      id: services.id,
      name: services.name,
      price: services.price,
      durationMin: services.durationMin,
    })
    .from(services)
    .where(and(eq(services.tenantId, tenant.id), eq(services.isActive, true)))
    .orderBy(services.sortOrder, services.name);
  if (!rows.length) return undefined;
  return grid(
    rows.map((s) => ({
      text: `${s.name} · ${formatToman(s.price)}`,
      cb: { a: "svc", svc: shortId(s.id) } as Callback,
    })),
    1,
  );
}

async function resolveService(db: Db, tenant: Tenant, short: string) {
  const rows = await db
    .select()
    .from(services)
    .where(and(eq(services.tenantId, tenant.id), eq(services.isActive, true)));
  return rows.find((s) => matchesShort(s.id, short)) ?? null;
}
async function resolveStaff(db: Db, tenant: Tenant, short: string) {
  if (short === ANY) return null;
  const rows = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.tenantId, tenant.id), eq(staffTable.isActive, true)));
  return rows.find((s) => matchesShort(s.id, short)) ?? null;
}

async function onService(ctx: BotCtx, db: Db, cb: Extract<Callback, { a: "svc" }>) {
  await safeAnswerCallback(ctx);
  const svc = await resolveService(db, ctx.tenant, cb.svc);
  if (!svc) return replyOrEdit(ctx, "این خدمت دیگر در دسترس نیست. /book را بزنید.");
  if (ctx.tenant.mode === "solo") {
    const only = (
      await db
        .select()
        .from(staffTable)
        .where(and(eq(staffTable.tenantId, ctx.tenant.id), eq(staffTable.isActive, true)))
    )[0];
    return showDays(ctx, db, cb.svc, only ? shortId(only.id) : ANY);
  }
  const people = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.tenantId, ctx.tenant.id), eq(staffTable.isActive, true)));
  const kb = grid(
    [
      { text: "فرقی نمی‌کند", cb: { a: "stf", svc: cb.svc, stf: ANY } as Callback },
      ...people.map((p) => ({
        text: p.name,
        cb: { a: "stf", svc: cb.svc, stf: shortId(p.id) } as Callback,
      })),
    ],
    2,
  )
    .row()
    .text("‹ بازگشت", encode({ a: "back", to: "svc" }));
  await replyOrEdit(ctx, `«${svc.name}»\nبا کدام آرایشگر؟`, kb);
}

async function onStaff(ctx: BotCtx, db: Db, cb: Extract<Callback, { a: "stf" }>) {
  await safeAnswerCallback(ctx);
  await showDays(ctx, db, cb.svc, cb.stf);
}

async function showDays(ctx: BotCtx, db: Db, svcShort: string, stfShort: string) {
  const svc = await resolveService(db, ctx.tenant, svcShort);
  if (!svc) return replyOrEdit(ctx, "این خدمت دیگر در دسترس نیست. /book را بزنید.");
  const stf = await resolveStaff(db, ctx.tenant, stfShort);
  const days = await availableDays(db, ctx.tenant, {
    serviceId: svc.id,
    staffId: stf ? stf.id : ANY,
  });
  if (!days.length)
    return replyOrEdit(
      ctx,
      "متأسفانه در روزهای پیش رو وقت خالی نیست. لطفاً بعداً دوباره تلاش کنید.",
    );
  const kb = grid(
    days.slice(0, 14).map((d) => ({
      text: formatJalaliLong(d),
      cb: { a: "day", svc: svcShort, stf: stfShort, day: jalaliKey(d) } as Callback,
    })),
    2,
  )
    .row()
    .text("‹ بازگشت", encode({ a: "back", to: ctx.tenant.mode === "solo" ? "svc" : "stf" }));
  await replyOrEdit(ctx, `«${svc.name}»${stf ? ` با ${stf.name}` : ""}\nکدام روز؟`, kb);
}

async function onDay(ctx: BotCtx, db: Db, cb: Extract<Callback, { a: "day" }>) {
  await safeAnswerCallback(ctx);
  const svc = await resolveService(db, ctx.tenant, cb.svc);
  const day = parseJalaliKey(cb.day);
  if (!svc || !day) return replyOrEdit(ctx, "انتخاب نامعتبر بود. /book را بزنید.");
  const stf = await resolveStaff(db, ctx.tenant, cb.stf);
  const per = await availableSlots(db, ctx.tenant, {
    serviceId: svc.id,
    staffId: stf ? stf.id : ANY,
    day,
  });
  const seen = new Map<number, { label: string }>();
  for (const s of per)
    for (const d of s.starts)
      if (!seen.has(d.getTime())) {
        const l = toLocal(d, ctx.tenant.timezone);
        seen.set(d.getTime(), { label: formatMinutes(l.hh * 60 + l.mm) });
      }
  const slots = [...seen.entries()].sort((a, b) => a[0] - b[0]);
  if (!slots.length)
    return replyOrEdit(ctx, "این روز پر شده است. روز دیگری انتخاب کنید.", undefined);
  const kb = grid(
    slots.map(([ms, v]) => ({
      text: v.label,
      cb: {
        a: "slot",
        svc: cb.svc,
        stf: cb.stf,
        day: cb.day,
        t: packTime(new Date(ms)),
      } as Callback,
    })),
    4,
  )
    .row()
    .text("‹ بازگشت", encode({ a: "back", to: "day" }));
  await replyOrEdit(ctx, `${formatJalaliLong(day)}\nکدام ساعت؟`, kb);
}

async function onSlot(ctx: BotCtx, db: Db, cb: Extract<Callback, { a: "slot" }>) {
  await safeAnswerCallback(ctx);
  const svc = await resolveService(db, ctx.tenant, cb.svc);
  if (!svc) return replyOrEdit(ctx, "این خدمت دیگر در دسترس نیست. /book را بزنید.");
  const startAt = unpackTime(cb.t);
  const platformUserId = String(ctx.from?.id);
  const known = await findCustomerByIdentity(db, ctx.tenant.id, ctx.platform, platformUserId);

  if (known) {
    await finalize(ctx, db, {
      svcShort: cb.svc,
      stfShort: cb.stf,
      startAt,
      name: known.name,
      phone: known.phone,
    });
    return;
  }
  await setState(db, ctx.tenant.id, ctx.platform, platformUserId, {
    await: "phone",
    svc: cb.svc,
    stf: cb.stf,
    t: cb.t,
  });
  const l = toLocal(startAt, ctx.tenant.timezone);
  await replyOrEdit(
    ctx,
    `انتخاب شما: ${formatJalaliLong(localDateOf(startAt, ctx.tenant.timezone))} ساعت ${formatMinutes(l.hh * 60 + l.mm)}`,
  );
  await ctx.reply("برای ثبت نهایی، شماره موبایل خود را بفرستید (یا دکمه زیر را بزنید):", {
    reply_markup: contactKeyboard(),
  });
}

async function completeWithPhone(ctx: BotCtx, db: Db, rawPhone: string) {
  const platformUserId = String(ctx.from?.id);
  const st = await getState(db, ctx.tenant.id, ctx.platform, platformUserId);
  if (st?.await !== "phone" || !st.svc || !st.t) {
    return ctx.reply("برای شروع رزرو /book را بزنید.", { reply_markup: removeKeyboard });
  }
  const phone = normalizeIranMobile(rawPhone);
  if (!phone) return ctx.reply("شماره معتبر نیست. نمونه درست: ۰۹۱۲۳۴۵۶۷۸۹");
  const name =
    [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ").trim() || "مشتری";
  await clearState(db, ctx.tenant.id, ctx.platform, platformUserId);
  await ctx.reply("در حال ثبت…", { reply_markup: removeKeyboard });
  await finalize(ctx, db, {
    svcShort: st.svc,
    stfShort: st.stf ?? ANY,
    startAt: unpackTime(st.t),
    name,
    phone,
  });
}

async function finalize(
  ctx: BotCtx,
  db: Db,
  input: { svcShort: string; stfShort: string; startAt: Date; name: string; phone: string },
) {
  const svc = await resolveService(db, ctx.tenant, input.svcShort);
  if (!svc) return void (await ctx.reply("این خدمت دیگر در دسترس نیست. /book را بزنید."));
  const stf = await resolveStaff(db, ctx.tenant, input.stfShort);
  const platformUserId = String(ctx.from?.id);
  try {
    const r = await createBooking(db, {
      tenant: ctx.tenant,
      serviceId: svc.id,
      staffId: stf ? stf.id : ANY,
      startAt: input.startAt,
      customer: { name: input.name, phone: input.phone },
      source: ctx.platform,
      identity: { platform: ctx.platform, platformUserId },
    });
    logger.info(
      { tenantId: ctx.tenant.id, platform: ctx.platform, bookingId: r.bookingId },
      "bot booking created",
    );
    // The outbox worker sends the confirmation/payment message, so the customer gets exactly one
    // copy no matter which channel they used. Here we only acknowledge.
    if (r.depositAmount > 0) {
      await ctx.reply(
        `✅ وقت شما موقتاً رزرو شد (کد ${isolate(r.code)}).\nراهنمای پرداخت بیعانه همین‌جا برایتان ارسال می‌شود…`,
      );
    } else {
      await ctx.reply(`✅ رزرو شما ثبت شد. کد رزرو: ${isolate(r.code)}`);
    }
  } catch (err) {
    if (err instanceof DomainError) {
      await ctx.reply(`${err.message}\n\nبرای انتخاب وقت دیگر /book را بزنید.`);
      return;
    }
    throw err;
  }
}

async function onBack(ctx: BotCtx, db: Db, cb: Extract<Callback, { a: "back" }>) {
  await safeAnswerCallback(ctx);
  if (cb.to === "svc")
    return replyOrEdit(ctx, "چه خدمتی می‌خواهید؟", await serviceKeyboard(db, ctx.tenant));
  await replyOrEdit(ctx, "برای شروع دوباره /book را بزنید.");
}

/** Customer tapped "I'll send the receipt" on the payment message. */
async function onReceiptRequested(ctx: BotCtx, db: Db, cb: Extract<Callback, { a: "receipt" }>) {
  await safeAnswerCallback(ctx);
  await setState(db, ctx.tenant.id, ctx.platform, String(ctx.from?.id), {
    await: "receipt",
    b: cb.b,
  });
  await ctx.reply("📎 لطفاً عکس رسید را همین‌جا بفرستید.");
}

/** Used by the notification sender to render the same message text the website shows. */
export function renderForBot(
  kind: Parameters<typeof renderNotification>[0],
  payload: BookingPayload,
) {
  const m = renderNotification(kind, payload);
  return { text: m.text, keyboard: toInlineKeyboard(m.buttons), photoPath: m.photoPath };
}

export function publicUrl(tenant: Tenant) {
  return tenantPublicUrl(getEnv(), tenant);
}
