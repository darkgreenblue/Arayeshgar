/**
 * Drives the real webhook router and grammY handlers against a mock Bot API and a real Postgres.
 * This is the closest we can get to the live bots before real tokens arrive.
 */
import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const mockPort = { url: "" };
const api = new (await import("./mock-api")).MockApi();
mockPort.url = await api.start();
process.env.TELEGRAM_API_ROOT = mockPort.url;
process.env.BALE_API_ROOT = mockPort.url;
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-test";
process.env.BASE_DOMAIN ??= "localhost";
process.env.BOTS_PUBLIC_URL = "https://bots.test.local";
process.env.UPLOADS_DIR = await mkdtemp(path.join(os.tmpdir(), "bot-uploads-"));

const { upd } = await import("./mock-api");
const hasDb = Boolean(process.env.DATABASE_URL);

const db = hasDb
  ? (await import("@arayeshgar/db")).createDb(process.env.DATABASE_URL, { max: 5 })
  : (null as never);
const schema = await import("@arayeshgar/db");
const core = await import("@arayeshgar/core");
const { createRouter } = await import("../src/router");
const { createSenders } = await import("../src/senders");
const { dropBot } = await import("../src/platform/bot");
const { encode, shortId } = await import("../src/platform/callback");

async function makeTenant(opts: { deposit?: boolean; mode?: "solo" | "salon_central" } = {}) {
  const slug = `b${randomBytes(4).toString("hex")}`;
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      slug,
      name: slug,
      mode: opts.mode ?? "solo",
      branding: { ...schema.defaultBranding(slug), tagline: "تست" },
      features: { ...schema.DEFAULT_FEATURES, deposit: opts.deposit ?? false },
      bookingRules: schema.DEFAULT_BOOKING_RULES,
      depositSettings: {
        ...schema.DEFAULT_DEPOSIT_SETTINGS,
        enabled: opts.deposit ?? false,
        mode: "fixed",
        amount: 100000,
        cardNumber: "6037991234567890",
        cardHolder: "تست",
      },
      telegramBotToken: "123:ABC",
      baleBotToken: "456:DEF",
      webhookSecret: randomBytes(8).toString("hex"),
    })
    .returning();
  const [st] = await db
    .insert(schema.staff)
    .values({ tenantId: tenant!.id, name: "آرایشگر" })
    .returning();
  const [svc] = await db
    .insert(schema.services)
    .values({ tenantId: tenant!.id, name: "اصلاح", durationMin: 30, price: 250000 })
    .returning();
  await db.insert(schema.staffServices).values({ staffId: st!.id, serviceId: svc!.id });
  const rows = [];
  for (let wd = 0; wd <= 6; wd++)
    rows.push({
      tenantId: tenant!.id,
      staffId: st!.id,
      weekday: wd,
      startMin: 9 * 60,
      endMin: 21 * 60,
    });
  await db.insert(schema.schedules).values(rows);
  const [owner] = await db
    .insert(schema.users)
    .values({
      tenantId: tenant!.id,
      role: "owner",
      username: "owner",
      passwordHash: "x",
      displayName: "مالک",
    })
    .returning();
  return { tenant: tenant!, staffId: st!.id, serviceId: svc!.id, ownerId: owner!.id };
}

describe.skipIf(!hasDb)("bot flows against a mock Bot API", () => {
  const router = hasDb ? createRouter(db) : (null as never);
  const created: string[] = [];
  const hook = async (
    t: { id: string; webhookSecret: string },
    update: unknown,
    platform = "telegram",
  ) =>
    router.request(`/hooks/${platform}/${t.id}/${t.webhookSecret}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(update),
    });

  beforeAll(() => {});
  afterAll(async () => {
    for (const id of created) await db.delete(schema.tenants).where(eq(schema.tenants.id, id));
    await api.stop();
  });

  it("rejects unknown tenants and wrong secrets", async () => {
    const f = await makeTenant();
    created.push(f.tenant.id);
    expect(
      (await hook({ id: f.tenant.id, webhookSecret: "wrong" }, upd.command("/start"))).status,
    ).toBe(403);
    expect(
      (
        await hook(
          { id: "11111111-2222-3333-4444-555555555555", webhookSecret: "x" },
          upd.command("/start"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await router.request(`/hooks/whatsapp/${f.tenant.id}/${f.tenant.webhookSecret}`, {
          method: "POST",
          body: "{}",
        })
      ).status,
    ).toBe(404);
  });

  it("skips a channel the tenant disabled", async () => {
    const f = await makeTenant();
    created.push(f.tenant.id);
    await db
      .update(schema.tenants)
      .set({ features: { ...f.tenant.features, bale_bot: false } })
      .where(eq(schema.tenants.id, f.tenant.id));
    const fresh = (await db.query.tenants.findFirst({
      where: eq(schema.tenants.id, f.tenant.id),
    }))!;
    const res = await hook(fresh, upd.command("/start"), "bale");
    expect(await res.json()).toMatchObject({ skipped: "channel disabled" });
  });

  it("walks a customer from /start to a confirmed booking (no deposit)", async () => {
    const f = await makeTenant();
    created.push(f.tenant.id);
    api.clear();

    await hook(f.tenant, upd.command("/start"));
    const welcome = api.last("sendMessage")!;
    expect(String(welcome.body.text)).toContain("خوش آمدید");
    const kb = welcome.body.reply_markup as {
      inline_keyboard: { text: string; callback_data: string }[][];
    };
    expect(kb.inline_keyboard[0]![0]!.text).toContain("اصلاح");

    // solo tenant: choosing the service goes straight to days
    await hook(f.tenant, upd.callback(kb.inline_keyboard[0]![0]!.callback_data));
    const days = api.last("editMessageText") ?? api.last("sendMessage")!;
    expect(String(days.body.text)).toContain("کدام روز؟");
    const dayCb = (days.body.reply_markup as { inline_keyboard: { callback_data: string }[][] })
      .inline_keyboard[0]![0]!.callback_data;

    await hook(f.tenant, upd.callback(dayCb));
    const slots = api.last("editMessageText")!;
    expect(String(slots.body.text)).toContain("کدام ساعت؟");
    const slotCb = (slots.body.reply_markup as { inline_keyboard: { callback_data: string }[][] })
      .inline_keyboard[0]![0]!.callback_data;

    // unknown customer -> asked for the phone with a contact-share keyboard
    await hook(f.tenant, upd.callback(slotCb));
    const ask = api.last("sendMessage")!;
    expect(String(ask.body.text)).toContain("شماره موبایل");
    expect(JSON.stringify(ask.body.reply_markup)).toContain("request_contact");

    await hook(f.tenant, upd.contact("+989121234567"));
    const rows = await db
      .select()
      .from(schema.bookings)
      .where(eq(schema.bookings.tenantId, f.tenant.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("confirmed");
    expect(rows[0]!.source).toBe("telegram");
    expect(api.texts().some((t) => t.includes("رزرو شما ثبت شد"))).toBe(true);

    // the phone is remembered: the next booking skips the phone step
    const cust = await db.query.customers.findFirst({
      where: eq(schema.customers.tenantId, f.tenant.id),
    });
    expect(cust!.phone).toBe("09121234567");
    const ident = await db.query.customerIdentities.findFirst({
      where: eq(schema.customerIdentities.customerId, cust!.id),
    });
    expect(ident!.platformUserId).toBe("5551");
  });

  it("deposit flow: payment instructions, receipt photo, admin approval in chat", async () => {
    const f = await makeTenant({ deposit: true });
    created.push(f.tenant.id);
    // link the owner's chat so they receive admin notifications
    const { code } = await core.issueBotLinkCode(db, f.ownerId);
    await hook(f.tenant, upd.command(`/link ${code}`, 9001));
    const owner = await db.query.users.findFirst({ where: eq(schema.users.id, f.ownerId) });
    expect(owner!.telegramChatId).toBe(9001);

    // book through the bot
    api.clear();
    await hook(f.tenant, upd.command("/start", 5552));
    const svcCb = (
      api.last("sendMessage")!.body.reply_markup as {
        inline_keyboard: { callback_data: string }[][];
      }
    ).inline_keyboard[0]![0]!.callback_data;
    await hook(f.tenant, upd.callback(svcCb, 5552));
    const dayCb = (
      api.last("editMessageText")!.body.reply_markup as {
        inline_keyboard: { callback_data: string }[][];
      }
    ).inline_keyboard[0]![0]!.callback_data;
    await hook(f.tenant, upd.callback(dayCb, 5552));
    const slotCb = (
      api.last("editMessageText")!.body.reply_markup as {
        inline_keyboard: { callback_data: string }[][];
      }
    ).inline_keyboard[0]![0]!.callback_data;
    await hook(f.tenant, upd.callback(slotCb, 5552));
    await hook(f.tenant, upd.contact("09129998877", 5552));

    const booking = (
      await db.select().from(schema.bookings).where(eq(schema.bookings.tenantId, f.tenant.id))
    )[0]!;
    expect(booking.status).toBe("pending_payment");
    expect(booking.depositAmount).toBe(100000);

    // the worker delivers the payment instructions and the admin alert
    api.clear();
    const drained = await core.drainOutbox(db, createSenders(db), 50);
    expect(drained.failed).toBe(0);
    const sent = api.texts().join("\n---\n");
    expect(sent).toContain("۶۰۳۷-۹۹۱۲-۳۴۵۶-۷۸۹۰"); // card number, Persian digits
    expect(sent).toContain("رزرو جدید"); // admin copy
    const toOwner = api
      .find("sendMessage")
      .filter((c) => c.body.chat_id === "9001" || c.body.chat_id === 9001);
    expect(toOwner.length).toBeGreaterThan(0);

    // customer taps "I'll send the receipt", then sends a photo
    await hook(f.tenant, upd.callback(encode({ a: "receipt", b: shortId(booking.id) }), 5552));
    api.clear();
    await hook(f.tenant, upd.photo(5552));
    const after = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, booking.id) });
    expect(after!.status).toBe("receipt_submitted");
    const payment = await db.query.payments.findFirst({
      where: eq(schema.payments.bookingId, booking.id),
    });
    expect(payment!.receiptPath).toMatch(/\.jpg$/);
    expect(api.texts().some((t) => t.includes("رسید شما دریافت شد"))).toBe(true);

    // the admin receives the receipt as a photo with approve/reject buttons
    api.clear();
    await core.drainOutbox(db, createSenders(db), 50);
    const photo = api.last("sendPhoto");
    expect(photo).toBeTruthy();
    expect(String(photo!.body.caption)).toContain("رسید بیعانه");

    // admin approves from the chat
    await hook(f.tenant, upd.callback(encode({ a: "approve", b: shortId(booking.id) }), 9001));
    const confirmed = await db.query.bookings.findFirst({
      where: eq(schema.bookings.id, booking.id),
    });
    expect(confirmed!.status).toBe("confirmed");

    // a non-admin chat cannot approve
    const f2 = await makeTenant({ deposit: true });
    created.push(f2.tenant.id);
    api.clear();
    await hook(f.tenant, upd.callback(encode({ a: "approve", b: shortId(booking.id) }), 4242));
    expect(api.texts().join()).not.toContain("تأیید شد");
  });

  it("/my lists the customer's booking and cancels it", async () => {
    const f = await makeTenant();
    created.push(f.tenant.id);
    await hook(f.tenant, upd.command("/start", 5553));
    const svcCb = (
      api.last("sendMessage")!.body.reply_markup as {
        inline_keyboard: { callback_data: string }[][];
      }
    ).inline_keyboard[0]![0]!.callback_data;
    await hook(f.tenant, upd.callback(svcCb, 5553));
    // pick a day further out so the booking is outside the 4-hour self-cancel cutoff
    const dayRows = (
      api.last("editMessageText")!.body.reply_markup as {
        inline_keyboard: { callback_data: string }[][];
      }
    ).inline_keyboard;
    await hook(
      f.tenant,
      upd.callback(
        dayRows[0]![1] ? dayRows[0]![1]!.callback_data : dayRows[0]![0]!.callback_data,
        5553,
      ),
    );
    const slotCb = (
      api.last("editMessageText")!.body.reply_markup as {
        inline_keyboard: { callback_data: string }[][];
      }
    ).inline_keyboard[0]![0]!.callback_data;
    await hook(f.tenant, upd.callback(slotCb, 5553));
    await hook(f.tenant, upd.contact("09121110022", 5553));
    const b = (
      await db.select().from(schema.bookings).where(eq(schema.bookings.tenantId, f.tenant.id))
    )[0]!;

    api.clear();
    await hook(f.tenant, upd.command("/my", 5553));
    const listed = api.last("sendMessage")!;
    expect(String(listed.body.text)).toContain(b.code);
    const cancelCb = (
      listed.body.reply_markup as { inline_keyboard: { callback_data: string }[][] }
    ).inline_keyboard[0]![0]!.callback_data;
    await hook(f.tenant, upd.callback(cancelCb, 5553));
    const after = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, b.id) });
    expect(after!.status).toBe("cancelled");
  });

  it("admin panel shows today's bookings and the pending queue", async () => {
    const f = await makeTenant();
    created.push(f.tenant.id);
    const { code } = await core.issueBotLinkCode(db, f.ownerId);
    await hook(f.tenant, upd.command(`/link ${code}`, 9002));
    api.clear();
    await hook(f.tenant, upd.command("/admin", 9002));
    expect(String(api.last("sendMessage")!.body.text)).toContain("پنل");
    await hook(f.tenant, upd.callback(encode({ a: "adm", v: "today" }), 9002));
    const today = api.last("editMessageText") ?? api.last("sendMessage")!;
    expect(String(today.body.text)).toContain("نوبت‌های امروز");
    await hook(f.tenant, upd.callback(encode({ a: "adm", v: "pending" }), 9002));
    const pending = api.last("editMessageText") ?? api.last("sendMessage")!;
    expect(String(pending.body.text)).toContain("در انتظار تأیید");
    // a stranger gets nothing
    api.clear();
    await hook(f.tenant, upd.command("/admin", 7777));
    expect(String(api.last("sendMessage")!.body.text)).toContain("وصل نیست");
  });

  it("the same bot code serves Bale through a different api root", async () => {
    const f = await makeTenant();
    created.push(f.tenant.id);
    dropBot(f.tenant.id, "bale");
    api.clear();
    const res = await hook(f.tenant, upd.command("/start", 6001), "bale");
    expect(res.status).toBe(200);
    expect(String(api.last("sendMessage")!.body.text)).toContain("خوش آمدید");
  });
});
