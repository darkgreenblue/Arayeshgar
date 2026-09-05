/**
 * Creates a whole tenant in one transaction: brand, staff, services, weekly hours, admin login.
 * Everything a barber needs to be live except the DNS record, which the wildcard already covers.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  DEFAULT_BOOKING_RULES,
  DEFAULT_FEATURES,
  defaultBranding,
  schedules,
  services,
  staff,
  staffServices,
  tenants,
  users,
  type Db,
  type Tenant,
  type TenantBranding,
} from "@arayeshgar/db";
import { Errors, pgErrorCode } from "../errors/domain";
import { logger } from "../logger";
import { hashPassword } from "../auth/password";
import { onboardingSchema, normalizePhoneOrUndefined, type OnboardingInput } from "./schema";

export type CreatedTenant = { tenant: Tenant; adminUsername: string; staffIds: string[] };

export async function createTenant(db: Db, input: OnboardingInput): Promise<CreatedTenant> {
  const d = onboardingSchema.parse(input);
  if (d.deposit.enabled && !d.deposit.cardNumber)
    throw Errors.validation("برای فعال کردن بیعانه، شماره کارت لازم است.");

  const branding: TenantBranding = {
    ...defaultBranding(d.displayName),
    tagline: d.tagline,
    about: d.about,
    logoUrl: d.logoUrl,
    heroImageUrl: d.heroImageUrl,
    gallery: d.gallery,
    primaryColor: d.primaryColor,
    fontHeading: d.fontHeading,
    fontBody: d.fontBody,
    phone: normalizePhoneOrUndefined(d.phone),
    address: d.address,
    mapUrl: d.mapUrl,
    instagram: d.instagram?.replace(/^@/, ""),
    faq: d.faq,
  };

  try {
    const result = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          slug: d.slug,
          name: d.displayName,
          mode: d.mode,
          status: d.status,
          theme: d.theme,
          branding,
          features: {
            ...DEFAULT_FEATURES,
            deposit: d.deposit.enabled,
            telegram_bot: Boolean(d.telegramBotToken),
            bale_bot: Boolean(d.baleBotToken),
          },
          bookingRules: { ...DEFAULT_BOOKING_RULES, ...(d.bookingRules ?? {}) },
          depositSettings: {
            enabled: d.deposit.enabled,
            cardNumber: d.deposit.cardNumber,
            cardHolder: d.deposit.cardHolder,
            bankName: d.deposit.bankName,
            mode: d.deposit.mode,
            amount: d.deposit.amount,
            policyText: d.deposit.policyText,
          },
          telegramBotToken: d.telegramBotToken || null,
          baleBotToken: d.baleBotToken || null,
          webhookSecret: randomBytes(24).toString("hex"),
        })
        .returning();
      if (!tenant) throw new Error("tenant insert failed");

      const staffRows = await tx
        .insert(staff)
        .values(
          d.staff.map((s, i) => ({
            tenantId: tenant.id,
            name: s.name,
            bio: s.bio ?? null,
            sortOrder: i,
          })),
        )
        .returning();
      const serviceRows = await tx
        .insert(services)
        .values(
          d.services.map((s, i) => ({
            tenantId: tenant.id,
            name: s.name,
            description: s.description ?? null,
            durationMin: s.durationMin,
            price: s.price,
            sortOrder: i,
          })),
        )
        .returning();
      // every barber offers every service at launch; the admin panel refines it later
      await tx
        .insert(staffServices)
        .values(
          staffRows.flatMap((st) =>
            serviceRows.map((sv) => ({ staffId: st.id, serviceId: sv.id })),
          ),
        );

      const hours = d.hours.length ? d.hours : [];
      if (hours.length) {
        await tx
          .insert(schedules)
          .values(
            staffRows.flatMap((st) =>
              hours.map((h) => ({
                tenantId: tenant.id,
                staffId: st.id,
                weekday: h.weekday,
                startMin: h.startMin,
                endMin: h.endMin,
              })),
            ),
          );
      }

      await tx.insert(users).values({
        tenantId: tenant.id,
        role: "owner",
        staffId: d.mode === "solo" ? staffRows[0]!.id : null,
        username: d.adminUsername,
        passwordHash: hashPassword(d.adminPassword),
        displayName: d.displayName,
      });

      return { tenant, staffIds: staffRows.map((s) => s.id) };
    });

    logger.info({ tenantId: result.tenant.id, slug: d.slug, mode: d.mode }, "tenant created");
    return { tenant: result.tenant, adminUsername: d.adminUsername, staffIds: result.staffIds };
  } catch (err) {
    if (pgErrorCode(err) === "23505")
      throw Errors.validation("این آدرس (slug) قبلاً استفاده شده است. یکی دیگر انتخاب کنید.");
    throw err;
  }
}

export async function slugAvailable(db: Db, slug: string): Promise<boolean> {
  const hit = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
    columns: { id: true },
  });
  return !hit;
}

/** Suggests a free slug from a display name (Persian names transliterate poorly, so we fall back). */
export async function suggestSlug(
  db: Db,
  displayName: string,
  instagram?: string,
): Promise<string> {
  const base =
    (instagram ?? "")
      .replace(/^@/, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") ||
    displayName.toLowerCase().replace(/[^a-z0-9-]/g, "") ||
    "barber";
  const cleaned = base.slice(0, 24).replace(/^-+|-+$/g, "") || "barber";
  if (await slugAvailable(db, cleaned)) return cleaned;
  for (let i = 2; i < 50; i++) {
    const candidate = `${cleaned}-${i}`;
    if (await slugAvailable(db, candidate)) return candidate;
  }
  return `${cleaned}-${randomBytes(2).toString("hex")}`;
}
