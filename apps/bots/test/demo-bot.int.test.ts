/**
 * The shared demo bot, driven through polling against the mock Bot API.
 *
 * One token answers for every prospect, so the risk this suite exists for is a chat
 * being answered as the wrong barber: two salons demoed side by side must never see
 * each other's name, services or bookings. Everything here is about that boundary.
 */
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const api = new (await import("./mock-api")).MockApi();
const apiUrl = await api.start();
process.env.TELEGRAM_API_ROOT = apiUrl;
process.env.BALE_API_ROOT = apiUrl;
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-test";
process.env.BASE_DOMAIN ??= "localhost";
process.env.BOTS_PUBLIC_URL = "https://bots.test.local";
process.env.DEMO_TELEGRAM_BOT_TOKEN = "999:shared-demo-token";

const { upd } = await import("./mock-api");
const schema = await import("@arayeshgar/db");
const dbUrl =
  process.env.DATABASE_URL ??
  path.join(os.tmpdir(), `arayeshgar-demo-${randomBytes(6).toString("hex")}.db`);
process.env.DATABASE_URL = dbUrl;
await schema.runMigrations(dbUrl);
const db = schema.createDb(dbUrl);

const { registerAll } = await import("../src/register");
const { getSharedDemoBot, dropSharedDemoBot, slugFromStart, demoDeepLink } =
  await import("../src/platform/demo");
const { startPolling, stopAllPolling } = await import("../src/platform/polling");

async function makeTenant(name: string, status: "demo" | "active" = "demo") {
  const slug = `d${randomBytes(4).toString("hex")}`;
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      slug,
      name,
      status,
      branding: { ...schema.defaultBranding(name), displayName: name },
      features: { ...schema.DEFAULT_FEATURES },
      bookingRules: { ...schema.DEFAULT_BOOKING_RULES },
      depositSettings: { ...schema.DEFAULT_DEPOSIT_SETTINGS },
      webhookSecret: "s",
    })
    .returning();
  if (!tenant) throw new Error("fixture tenant");
  const [barber] = await db
    .insert(schema.staff)
    .values({ tenantId: tenant.id, name: "آرایشگر" })
    .returning();
  const [svc] = await db
    .insert(schema.services)
    .values({ tenantId: tenant.id, name: `خدمت ${name}`, durationMin: 30, price: 250000 })
    .returning();
  if (!barber || !svc) throw new Error("fixture rows");
  await db.insert(schema.staffServices).values({ staffId: barber.id, serviceId: svc.id });
  return tenant;
}

async function until(check: () => boolean, timeoutMs = 5000): Promise<boolean> {
  for (let waited = 0; waited < timeoutMs; waited += 25) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return check();
}

/** Sends one update through the poller and returns the texts the bot replied with. */
async function say(update: unknown): Promise<string> {
  api.clear();
  api.deliver(update);
  await until(() => api.find("sendMessage").length > 0);
  return api.texts().join("\n");
}

describe("shared demo bot", () => {
  type Row = Awaited<ReturnType<typeof makeTenant>>;
  let salonA: Row;
  let salonB: Row;
  let sold: Row;

  beforeAll(async () => {
    salonA = await makeTenant("سالن الف");
    salonB = await makeTenant("سالن ب");
    sold = await makeTenant("مشتری فروخته‌شده", "active");
    const bot = await getSharedDemoBot(db, "telegram", (b) => registerAll(b, db));
    if (!bot) throw new Error("shared demo bot not built");
    await startPolling("shared-demo", "telegram", bot, "999:shared-demo-token");
  });

  afterAll(async () => {
    await stopAllPolling();
    dropSharedDemoBot("telegram");
    for (const t of [salonA, salonB, sold]) await schema.deleteTenant(db, t.id);
    await api.stop();
  });

  it("parses the deep-link payload and ignores anything else", () => {
    expect(slugFromStart("/start t_ali-salon")).toBe("ali-salon");
    expect(slugFromStart("/start@arayeshgar_bot t_ali")).toBe("ali");
    expect(slugFromStart("/start")).toBeNull();
    expect(slugFromStart("/book t_ali")).toBeNull();
    expect(demoDeepLink("demo_bot", "telegram", "ali")).toBe("https://t.me/demo_bot?start=t_ali");
  });

  it("asks for a link when the chat has never been bound", async () => {
    const text = await say(upd.command("/start", 6001));
    expect(text).toContain("لینکی که آرایشگر برایتان فرستاده");
  });

  it("binds a chat to the tenant in its deep link", async () => {
    const text = await say(upd.command(`/start t_${salonA.slug}`, 6002));
    expect(text).toContain("سالن الف");
    expect(text).not.toContain("سالن ب");
  });

  it("remembers the binding on later messages with no payload", async () => {
    await say(upd.command(`/start t_${salonA.slug}`, 6003));
    const text = await say(upd.command("/book", 6003));
    expect(text).toContain("چه خدمتی");
    // The keyboard must offer this salon's service, not the other one's.
    const keyboard = JSON.stringify(api.last("sendMessage")?.body.reply_markup ?? {});
    expect(keyboard).toContain("سالن الف");
    expect(keyboard).not.toContain("سالن ب");
  });

  it("keeps two prospects apart in the same bot", async () => {
    await say(upd.command(`/start t_${salonA.slug}`, 6004));
    await say(upd.command(`/start t_${salonB.slug}`, 6005));

    expect(await say(upd.command("/start", 6004))).toContain("سالن الف");
    expect(await say(upd.command("/start", 6005))).toContain("سالن ب");
  });

  it("re-binds when a chat opens a different barber's link", async () => {
    await say(upd.command(`/start t_${salonA.slug}`, 6006));
    const text = await say(upd.command(`/start t_${salonB.slug}`, 6006));
    expect(text).toContain("سالن ب");
    expect(await say(upd.command("/start", 6006))).toContain("سالن ب");
  });

  it("refuses to serve a sold tenant, whatever slug is typed", async () => {
    // A sold customer's bookings must never be reachable through the shared demo bot.
    const text = await say(upd.command(`/start t_${sold.slug}`, 6007));
    expect(text).toContain("لینکی که آرایشگر برایتان فرستاده");
    expect(text).not.toContain("مشتری فروخته‌شده");
  });

  it("refuses an unknown slug", async () => {
    const text = await say(upd.command("/start t_does-not-exist", 6008));
    expect(text).toContain("لینکی که آرایشگر برایتان فرستاده");
  });
});
