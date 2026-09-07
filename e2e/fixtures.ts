/**
 * Creates (and removes) a disposable tenant for the golden-path run, using the same onboarding
 * code the wizard and CLI use.
 */
import { eq } from "drizzle-orm";
import { createDb, deleteTenant, tenants } from "@arayeshgar/db";
import { createTenant, DEFAULT_HOURS } from "@arayeshgar/core";

export const SLUG = "demo-e2e";
export const ADMIN = { username: "e2eadmin", password: "supersecret" };

/** Same file the web server under test opens, so the run exercises one real database. */
export const E2E_DB_PATH = process.env.DATABASE_URL ?? "data/e2e.db";

export function db() {
  return createDb(E2E_DB_PATH);
}

export async function resetTenant() {
  const d = db();
  await dropBySlug(d);
  const { tenant } = await createTenant(d, {
    slug: SLUG,
    displayName: "آرایشگاه تست سرتاسری",
    mode: "solo",
    tagline: "اصلاح حرفه‌ای، وقت دقیق",
    about: "این آرایشگاه فقط برای تست خودکار ساخته شده است.",
    phone: "09120000000",
    staff: [{ name: "علی رضایی" }],
    services: [{ name: "اصلاح مو", durationMin: 30, price: 250000 }],
    hours: DEFAULT_HOURS.map((h) => ({ ...h, startMin: 9 * 60, endMin: 21 * 60 })).concat([
      { weekday: 6, startMin: 9 * 60, endMin: 21 * 60 },
    ]),
    deposit: {
      enabled: true,
      cardNumber: "6037991234567890",
      cardHolder: "علی رضایی",
      bankName: "ملی",
      mode: "fixed",
      amount: 100000,
    },
    theme: "night-gold",
    adminUsername: ADMIN.username,
    adminPassword: ADMIN.password,
    status: "active",
  });
  return tenant;
}

export async function dropTenant() {
  await dropBySlug(db());
}

/** A 1x1 JPEG used as the receipt upload. */
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(512)]);

/** Tenants are removed explicitly, not by cascade — see deleteTenant in @arayeshgar/db. */
async function dropBySlug(d: ReturnType<typeof db>) {
  const existing = await d.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SLUG));
  for (const row of existing) await deleteTenant(d, row.id);
}
