/**
 * Seeds a demo tenant ("demo") so the stack is usable immediately after `docker compose up`.
 * Idempotent: re-running updates nothing if the tenant exists.
 *
 * Admin login for the demo tenant: username "admin", password "admin1234" (change in prod).
 */
import { randomBytes, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb } from "./client";
import {
  DEFAULT_BOOKING_RULES,
  DEFAULT_DEPOSIT_SETTINGS,
  DEFAULT_FEATURES,
  defaultBranding,
} from "./defaults";
import { schedules, services, staff, staffServices, tenants, users } from "./schema";

// Same format as @arayeshgar/core/auth/password (scrypt: salt$hash) — duplicated here to keep
// the db package dependency-free. Keep both in sync.
function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export async function seed(url = process.env.DATABASE_URL) {
  const db = createDb(url, { max: 1 });
  const existing = await db.query.tenants.findFirst({ where: eq(tenants.slug, "demo") });
  if (existing) {
    console.error("[seed] demo tenant already exists, skipping");
    return;
  }

  await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        slug: "demo",
        name: "آرایشگاه دمو",
        mode: "solo",
        status: "demo",
        theme: "night-gold",
        branding: {
          ...defaultBranding("آرایشگاه دمو"),
          tagline: "اصلاح حرفه‌ای، وقت دقیق",
          about: "بیش از ده سال تجربه در اصلاح مو و ریش مردانه. اینجا وقتت محترم است.",
          phone: "09120000000",
          address: "تهران، خیابان ولیعصر",
          instagram: "demo.barber",
          faq: [
            {
              q: "اگر دیر برسم چه می‌شود؟",
              a: "تا ۱۰ دقیقه تأخیر مشکلی ندارد؛ بعد از آن نوبت کنسل می‌شود.",
            },
            { q: "بیعانه برگشت داده می‌شود؟", a: "در صورت کنسل کردن تا ۴ ساعت قبل، بله." },
          ],
        },
        features: { ...DEFAULT_FEATURES, deposit: true },
        bookingRules: DEFAULT_BOOKING_RULES,
        depositSettings: {
          ...DEFAULT_DEPOSIT_SETTINGS,
          enabled: true,
          cardNumber: "6037991234567890",
          cardHolder: "علی رضایی",
          bankName: "ملی",
          mode: "fixed",
          amount: 100000,
          policyText: "بیعانه در صورت کنسل کردن کمتر از ۴ ساعت قبل از نوبت برگشت داده نمی‌شود.",
        },
        webhookSecret: randomBytes(24).toString("hex"),
      })
      .returning();
    if (!tenant) throw new Error("tenant insert failed");

    const [barber] = await tx
      .insert(staff)
      .values({ tenantId: tenant.id, name: "علی رضایی", bio: "متخصص فید و اصلاح کلاسیک" })
      .returning();
    if (!barber) throw new Error("staff insert failed");

    await tx.insert(users).values({
      tenantId: tenant.id,
      role: "owner",
      staffId: barber.id,
      username: "admin",
      passwordHash: hashPassword("admin1234"),
      displayName: "علی رضایی",
    });

    const svc = await tx
      .insert(services)
      .values([
        { tenantId: tenant.id, name: "اصلاح مو", durationMin: 30, price: 250000, sortOrder: 1 },
        { tenantId: tenant.id, name: "اصلاح ریش", durationMin: 20, price: 150000, sortOrder: 2 },
        { tenantId: tenant.id, name: "مو + ریش", durationMin: 50, price: 350000, sortOrder: 3 },
      ])
      .returning();
    await tx
      .insert(staffServices)
      .values(svc.map((s) => ({ staffId: barber.id, serviceId: s.id })));

    // Saturday..Thursday 10:00-20:00 with a 14:00-15:00 break; Friday closed (weekday 6)
    const rows = [];
    for (let weekday = 0; weekday <= 5; weekday++) {
      rows.push({
        tenantId: tenant.id,
        staffId: barber.id,
        weekday,
        startMin: 10 * 60,
        endMin: 14 * 60,
      });
      rows.push({
        tenantId: tenant.id,
        staffId: barber.id,
        weekday,
        startMin: 15 * 60,
        endMin: 20 * 60,
      });
    }
    await tx.insert(schedules).values(rows);
  });

  // Platform admin (owner of the SaaS). Bootstrapped from env on first seed.
  const platformUser = process.env.PLATFORM_ADMIN_USERNAME ?? "admin";
  const platformPass = process.env.PLATFORM_ADMIN_PASSWORD ?? "change-me";
  await db
    .insert(users)
    .values({
      tenantId: null,
      role: "platform_admin",
      username: platformUser,
      passwordHash: hashPassword(platformPass),
      displayName: "Platform admin",
    })
    .onConflictDoNothing();

  console.error("[seed] demo tenant created (slug=demo, admin/admin1234)");
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ""));
if (isMain) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[seed] failed", err);
      process.exit(1);
    });
}
