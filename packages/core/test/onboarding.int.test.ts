import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schedules, services, staff, staffServices, tenants, users } from "@arayeshgar/db";
import { createTenant, slugAvailable, suggestSlug } from "../src/onboarding/create";
import { DEFAULT_HOURS, DEFAULT_SERVICES, onboardingSchema } from "../src/onboarding/schema";
import {
  aiCopyAvailable,
  generateCopy,
  stripFences,
  templateCopy,
  copyResult,
} from "../src/onboarding/ai-copy";
import {
  platformListTenants,
  platformSetCustomDomain,
  platformSetFeatures,
  platformSetStatus,
  platformStats,
} from "../src/onboarding/platform";
import { availableDays } from "../src/availability/availability";
import { verifyPassword } from "../src/auth/password";
import { hasDb, testDb } from "./helpers/db";

describe("onboarding validation & copy (no DB)", () => {
  const base = {
    slug: "test-barber",
    displayName: "آرایشگاه تست",
    staff: [{ name: "علی" }],
    services: DEFAULT_SERVICES,
    hours: DEFAULT_HOURS,
    adminPassword: "supersecret",
  };
  it("rejects reserved and malformed slugs", () => {
    expect(onboardingSchema.safeParse({ ...base, slug: "platform" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, slug: "AliBarber" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, slug: "-bad-" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, slug: "ok-slug" }).success).toBe(true);
  });
  it("requires an admin password and at least one staff and service", () => {
    expect(onboardingSchema.safeParse({ ...base, adminPassword: "short" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, staff: [] }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, services: [] }).success).toBe(false);
  });
  it("applies defaults so a minimal payload is enough", () => {
    const d = onboardingSchema.parse(base);
    expect(d.mode).toBe("solo");
    expect(d.theme).toBe("night-gold");
    expect(d.status).toBe("demo");
    expect(d.adminUsername).toBe("admin");
    expect(d.deposit.enabled).toBe(false);
  });
  it("template copy is always valid and mentions the business", () => {
    const c = templateCopy({
      displayName: "آرایشگاه تست",
      mode: "solo",
      services: DEFAULT_SERVICES,
    });
    expect(copyResult.safeParse(c).success).toBe(true);
    expect(c.about).toContain("آرایشگاه تست");
    expect(c.seoTitle.length).toBeLessThanOrEqual(70);
    expect(c.seoDescription.length).toBeLessThanOrEqual(160);
    expect(c.tagline).not.toMatch(/[😀-🿿]/u);
  });
  it("falls back to templates when no API key is configured", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(aiCopyAvailable()).toBe(false);
    const r = await generateCopy({
      displayName: "تست",
      mode: "solo",
      services: [{ name: "اصلاح" }],
    });
    expect(r.source).toBe("template");
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  });
  it("strips code fences models add around JSON", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe.skipIf(!hasDb)("tenant creation (Postgres)", () => {
  const db = hasDb ? testDb() : (null as never);
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await db.delete(tenants).where(eq(tenants.id, id));
  });

  it("creates a complete, immediately bookable tenant in one call", async () => {
    const slug = `on${Math.random().toString(36).slice(2, 8)}`;
    const { tenant, adminUsername } = await createTenant(db, {
      slug,
      displayName: "آرایشگاه آنبورد",
      mode: "salon_central",
      staff: [{ name: "الف رضایی" }, { name: "بهرام" }],
      services: DEFAULT_SERVICES,
      hours: DEFAULT_HOURS,
      deposit: {
        enabled: true,
        cardNumber: "6037991234567890",
        cardHolder: "الف رضایی",
        mode: "fixed",
        amount: 50000,
      },
      adminPassword: "supersecret",
      telegramBotToken: "123:ABC",
    });
    created.push(tenant.id);
    expect(tenant.slug).toBe(slug);
    expect(tenant.features.deposit).toBe(true);
    expect(tenant.features.telegram_bot).toBe(true);
    expect(tenant.features.bale_bot).toBe(false); // no token given
    expect(tenant.webhookSecret).toHaveLength(48);

    const [people, svc, links, hours, owner] = await Promise.all([
      db.select().from(staff).where(eq(staff.tenantId, tenant.id)),
      db.select().from(services).where(eq(services.tenantId, tenant.id)),
      db.select().from(staffServices),
      db.select().from(schedules).where(eq(schedules.tenantId, tenant.id)),
      db.query.users.findFirst({ where: eq(users.tenantId, tenant.id) }),
    ]);
    expect(people).toHaveLength(2);
    expect(svc).toHaveLength(3);
    expect(links.filter((l) => people.some((p) => p.id === l.staffId))).toHaveLength(6); // every barber offers every service
    expect(hours).toHaveLength(2 * DEFAULT_HOURS.length);
    expect(owner?.username).toBe(adminUsername);
    expect(verifyPassword("supersecret", owner!.passwordHash)).toBe(true);

    // and it can take bookings right away
    const days = await availableDays(db, tenant, { staffId: "any", serviceId: svc[0]!.id });
    expect(days.length).toBeGreaterThan(5);
  });

  it("refuses a duplicate slug and suggests a free one", async () => {
    const slug = `dup${Math.random().toString(36).slice(2, 7)}`;
    const { tenant } = await createTenant(db, {
      slug,
      displayName: "اول",
      staff: [{ name: "الف رضایی" }],
      services: DEFAULT_SERVICES,
      hours: [],
      adminPassword: "supersecret",
    });
    created.push(tenant.id);
    await expect(
      createTenant(db, {
        slug,
        displayName: "دوم",
        staff: [{ name: "بهرام" }],
        services: DEFAULT_SERVICES,
        hours: [],
        adminPassword: "supersecret",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await slugAvailable(db, slug)).toBe(false);
    expect(await suggestSlug(db, "x", slug)).toBe(`${slug}-2`);
  });

  it("platform operations: listing, flags, status, custom domain and stats", async () => {
    const slug = `pf${Math.random().toString(36).slice(2, 7)}`;
    const { tenant } = await createTenant(db, {
      slug,
      displayName: "پلتفرم تست",
      staff: [{ name: "الف رضایی" }],
      services: DEFAULT_SERVICES,
      hours: [],
      adminPassword: "supersecret",
    });
    created.push(tenant.id);

    const list = await platformListTenants(db);
    const row = list.find((t) => t.id === tenant.id)!;
    expect(row.owner).toBe("admin");
    expect(row.bookings30d).toBe(0);

    const features = await platformSetFeatures(db, tenant.id, { reviews: true, deposit: true });
    expect(features.reviews).toBe(true);
    expect(features.deposit).toBe(true);
    expect(Object.keys(features).length).toBeGreaterThan(10); // unknown keys dropped, all known keys present

    expect((await platformSetStatus(db, tenant.id, "active")).status).toBe("active");
    expect(
      (await platformSetCustomDomain(db, tenant.id, "HTTPS://Ali-Barber.ir/path")).customDomain,
    ).toBe("ali-barber.ir");
    await expect(platformSetCustomDomain(db, tenant.id, "not a domain")).rejects.toMatchObject({
      code: "VALIDATION",
    });

    const other = await createTenant(db, {
      slug: `${slug}b`,
      displayName: "دیگری",
      staff: [{ name: "بهرام" }],
      services: DEFAULT_SERVICES,
      hours: [],
      adminPassword: "supersecret",
    });
    created.push(other.tenant.id);
    await expect(
      platformSetCustomDomain(db, other.tenant.id, "ali-barber.ir"),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const stats = await platformStats(db);
    expect(stats.tenants).toBeGreaterThan(0);
    expect(stats.activeTenants).toBeGreaterThan(0);
  });
});
