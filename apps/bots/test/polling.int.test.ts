/**
 * Long polling, driven against the mock Bot API.
 *
 * Writing the transport is not the same as knowing it works: a poller that never calls
 * getUpdates, or one that keeps polling after its tenant is removed, looks identical
 * from the outside. So this starts a real poller, hands it a real update through
 * getUpdates, and checks that the same handlers the webhook path uses actually replied.
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

const { upd } = await import("./mock-api");
const schema = await import("@arayeshgar/db");
const dbUrl =
  process.env.DATABASE_URL ??
  path.join(os.tmpdir(), `arayeshgar-poll-${randomBytes(6).toString("hex")}.db`);
process.env.DATABASE_URL = dbUrl;
await schema.runMigrations(dbUrl);
const db = schema.createDb(dbUrl);

const { defaultBranding, DEFAULT_BOOKING_RULES, DEFAULT_DEPOSIT_SETTINGS, DEFAULT_FEATURES } =
  schema;
const { getBot, dropBot } = await import("../src/platform/bot");
const { registerAll } = await import("../src/register");
const { startPolling, stopPolling, stopAllPolling, pollingCount } =
  await import("../src/platform/polling");

const TOKEN = "111:poll-token";

async function makeTenant() {
  const slug = `p${randomBytes(4).toString("hex")}`;
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      slug,
      name: slug,
      branding: defaultBranding(slug),
      features: { ...DEFAULT_FEATURES },
      bookingRules: { ...DEFAULT_BOOKING_RULES },
      depositSettings: { ...DEFAULT_DEPOSIT_SETTINGS },
      webhookSecret: "s",
      telegramBotToken: TOKEN,
    })
    .returning();
  if (!tenant) throw new Error("fixture tenant");
  const [barber] = await db
    .insert(schema.staff)
    .values({ tenantId: tenant.id, name: "آرایشگر" })
    .returning();
  const [svc] = await db
    .insert(schema.services)
    .values({ tenantId: tenant.id, name: "اصلاح", durationMin: 30, price: 250000 })
    .returning();
  if (!barber || !svc) throw new Error("fixture rows");
  await db.insert(schema.staffServices).values({ staffId: barber.id, serviceId: svc.id });
  return tenant;
}

/** Waits for a condition the poller fulfils asynchronously, or gives up. */
async function until(check: () => boolean, timeoutMs = 5000): Promise<boolean> {
  for (let waited = 0; waited < timeoutMs; waited += 25) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return check();
}

describe("long polling transport", () => {
  let tenantId: string;

  beforeAll(async () => {
    const tenant = await makeTenant();
    tenantId = tenant.id;
    const bot = await getBot(tenant, "telegram", (b) => registerAll(b, db));
    if (!bot) throw new Error("bot not built");
    await startPolling(tenant.id, "telegram", bot, TOKEN);
  });

  afterAll(async () => {
    await stopAllPolling();
    dropBot(tenantId, "telegram");
    await schema.deleteTenant(db, tenantId);
    await api.stop();
  });

  it("clears any webhook before asking for updates", async () => {
    // Telegram refuses getUpdates while a webhook is registered, so a tenant switching
    // from webhook mode would be silently deaf without this call.
    expect(await until(() => api.find("deleteWebhook").length > 0)).toBe(true);
    expect(await until(() => api.find("getUpdates").length > 0)).toBe(true);
  });

  it("handles an update delivered through getUpdates", async () => {
    api.clear();
    api.deliver(upd.command("/start"));
    expect(await until(() => api.find("sendMessage").length > 0)).toBe(true);
    expect(api.texts().join("\n")).toContain("خوش آمدید");
  });

  it("stops when the tenant is taken offline", async () => {
    expect(pollingCount()).toBe(1);
    await stopPolling(tenantId, "telegram");
    expect(pollingCount()).toBe(0);

    // Nothing should consume this update once the poller is gone.
    api.clear();
    api.deliver(upd.command("/start"));
    await new Promise((r) => setTimeout(r, 300));
    expect(api.find("sendMessage")).toHaveLength(0);
  });
});
