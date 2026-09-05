import { z } from "zod";
import type { BookingRules, DepositSettings, Staff, Tenant, TenantBranding } from "@arayeshgar/db";
import { DEFAULT_BOOKING_RULES, DEFAULT_DEPOSIT_SETTINGS } from "@arayeshgar/db";

/** zod schemas for the JSONB columns. Used by onboarding, admin settings and as a runtime guard. */
export const bookingRulesSchema = z.object({
  slotStepMin: z.number().int().min(5).max(120),
  bufferMin: z.number().int().min(0).max(120),
  minLeadMin: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  horizonDays: z.number().int().min(1).max(90),
  paymentDeadlineMin: z
    .number()
    .int()
    .min(5)
    .max(24 * 60),
  cancelBeforeHours: z.number().int().min(0).max(72),
  autoConfirmWithoutDeposit: z.boolean(),
  maxActiveBookingsPerPhone: z.number().int().min(1).max(10),
  maxBookingsPerPhonePerDay: z.number().int().min(1).max(20),
}) satisfies z.ZodType<BookingRules>;

export const depositSettingsSchema = z.object({
  enabled: z.boolean(),
  cardNumber: z
    .string()
    .regex(/^\d{16}$/, "شماره کارت باید ۱۶ رقم باشد")
    .optional(),
  cardHolder: z.string().min(2).max(80).optional(),
  bankName: z.string().max(40).optional(),
  mode: z.enum(["fixed", "percent"]),
  amount: z.number().int().min(0),
  policyText: z.string().max(500).optional(),
}) satisfies z.ZodType<DepositSettings>;

export const brandingSchema = z.object({
  displayName: z.string().min(2).max(60),
  tagline: z.string().max(120).optional(),
  about: z.string().max(2000).optional(),
  logoUrl: z.string().optional(),
  heroImageUrl: z.string().optional(),
  gallery: z.array(z.string()).max(30),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  fontHeading: z.enum(["estedad", "vazirmatn", "sahel"]),
  fontBody: z.enum(["vazirmatn", "sahel"]),
  phone: z.string().optional(),
  address: z.string().max(300).optional(),
  mapUrl: z.string().optional(),
  instagram: z.string().max(60).optional(),
  telegram: z.string().max(60).optional(),
  bale: z.string().max(60).optional(),
  faq: z.array(z.object({ q: z.string().max(200), a: z.string().max(1000) })).max(20),
  seo: z
    .object({ title: z.string().max(70).optional(), description: z.string().max(160).optional() })
    .optional(),
}) satisfies z.ZodType<TenantBranding>;

/** Merge stored rules over defaults so older tenants keep working when new keys are added. */
export function effectiveRules(tenant: Pick<Tenant, "bookingRules">): BookingRules {
  return { ...DEFAULT_BOOKING_RULES, ...(tenant.bookingRules ?? {}) };
}

export function effectiveDeposit(
  tenant: Pick<Tenant, "depositSettings" | "features">,
): DepositSettings {
  const d = { ...DEFAULT_DEPOSIT_SETTINGS, ...(tenant.depositSettings ?? {}) };
  // The feature flag is the master switch.
  return { ...d, enabled: d.enabled && tenant.features?.deposit === true };
}

/** Which card the customer should pay to: staff's own card (salon_independent) or the tenant's. */
export function payToCard(
  tenant: Pick<Tenant, "depositSettings" | "features" | "mode">,
  staffRow: Pick<Staff, "depositSettings"> | null,
): { cardNumber?: string; cardHolder?: string; bankName?: string } {
  const base = effectiveDeposit(tenant);
  if (tenant.mode === "salon_independent" && staffRow?.depositSettings?.cardNumber) {
    return {
      cardNumber: staffRow.depositSettings.cardNumber,
      cardHolder: staffRow.depositSettings.cardHolder ?? base.cardHolder,
      bankName: staffRow.depositSettings.bankName ?? base.bankName,
    };
  }
  return { cardNumber: base.cardNumber, cardHolder: base.cardHolder, bankName: base.bankName };
}
