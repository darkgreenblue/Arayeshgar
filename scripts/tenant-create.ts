/**
 * CLI onboarding — the same code path as the wizard, for scripted or bulk setup.
 *
 *   pnpm tenant:create --file tenant.json
 *   pnpm tenant:create --example > tenant.json
 *
 * The JSON shape is packages/core/src/onboarding/schema.ts (validated with zod).
 */
import { readFile } from "node:fs/promises";
import { createDb } from "@arayeshgar/db";
import {
  createTenant,
  DEFAULT_HOURS,
  DEFAULT_SERVICES,
  getEnv,
  onboardingSchema,
  tenantPublicUrl,
  type OnboardingInput,
} from "@arayeshgar/core";

const EXAMPLE: OnboardingInput = {
  slug: "ali-barber",
  displayName: "آرایشگاه علی",
  mode: "solo",
  tagline: "اصلاح حرفه‌ای با وقت دقیق",
  about: "بیش از ده سال تجربه در اصلاح مو و ریش مردانه.",
  phone: "09120000000",
  address: "تهران، خیابان ولیعصر",
  instagram: "ali.barber",
  gallery: [],
  faq: [],
  staff: [{ name: "علی رضایی", bio: "متخصص فید" }],
  services: DEFAULT_SERVICES,
  hours: DEFAULT_HOURS,
  deposit: {
    enabled: true,
    cardNumber: "6037991234567890",
    cardHolder: "علی رضایی",
    bankName: "ملی",
    mode: "fixed",
    amount: 100000,
  },
  theme: "night-gold",
  primaryColor: "#C9A227",
  adminUsername: "admin",
  adminPassword: "change-me-now",
  status: "demo",
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.argv.includes("--example")) {
    console.log(JSON.stringify(EXAMPLE, null, 2));
    return;
  }
  const file = arg("file");
  if (!file) {
    console.error(
      "usage: pnpm tenant:create --file tenant.json   (or --example to print a template)",
    );
    process.exit(2);
  }
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("فایل معتبر نیست:");
    for (const i of parsed.error.issues)
      console.error(`  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    process.exit(1);
  }
  const env = getEnv();
  const db = createDb(env.DATABASE_URL, { max: 2 });
  const { tenant, adminUsername } = await createTenant(db, parsed.data);
  const url = tenantPublicUrl(env, tenant);
  console.log(`\n✅ ساخته شد: ${tenant.name}`);
  console.log(`   سایت:        ${url}`);
  console.log(`   پنل ادمین:   ${url}/admin   (کاربر: ${adminUsername})`);
  console.log(`   وضعیت:       ${tenant.status}`);
  if (tenant.telegramBotToken || tenant.baleBotToken)
    console.log("   وب‌هوک ربات‌ها با اجرای سرویس bots خودکار ست می‌شود.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
