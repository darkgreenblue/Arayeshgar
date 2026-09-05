/**
 * The single definition of "what it takes to launch a barber". The wizard, the CLI and the API all
 * validate against this, so a tenant created from a JSON file is identical to one made by clicking.
 */
import { z } from "zod";
import { DEFAULT_BOOKING_RULES } from "@arayeshgar/db";
import { normalizeIranMobile } from "../utils/phone";

export const RESERVED_SLUGS = [
  "platform",
  "www",
  "admin",
  "api",
  "app",
  "bots",
  "mail",
  "static",
  "demo-old",
];

export const slugSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "فقط حروف کوچک انگلیسی، عدد و خط تیره")
  .refine((s) => !RESERVED_SLUGS.includes(s), "این نام رزرو شده است");

export const serviceDraft = z.object({
  name: z.string().min(2).max(60),
  durationMin: z.number().int().min(5).max(480),
  price: z.number().int().min(0),
  description: z.string().max(200).optional(),
});

export const hoursDraft = z.object({
  weekday: z.number().int().min(0).max(6), // 0 = Saturday
  startMin: z.number().int().min(0).max(1440),
  endMin: z.number().int().min(0).max(1440),
});

export const onboardingSchema = z.object({
  // 1) brand
  slug: slugSchema,
  displayName: z.string().min(2).max(60),
  mode: z.enum(["solo", "salon_central", "salon_independent"]).default("solo"),
  tagline: z.string().max(120).optional(),
  about: z.string().max(2000).optional(),
  phone: z.string().optional(),
  address: z.string().max(300).optional(),
  mapUrl: z.string().optional(),
  instagram: z.string().max(60).optional(),
  logoUrl: z.string().optional(),
  heroImageUrl: z.string().optional(),
  gallery: z.array(z.string()).max(30).default([]),
  faq: z
    .array(z.object({ q: z.string().max(200), a: z.string().max(1000) }))
    .max(20)
    .default([]),
  // 2) staff & services
  staff: z
    .array(z.object({ name: z.string().min(2).max(60), bio: z.string().max(300).optional() }))
    .min(1)
    .max(30),
  services: z.array(serviceDraft).min(1).max(40),
  // 3) hours
  hours: z.array(hoursDraft).default([]),
  // 4) deposit
  deposit: z
    .object({
      enabled: z.boolean().default(false),
      cardNumber: z
        .string()
        .regex(/^\d{16}$/)
        .optional(),
      cardHolder: z.string().max(80).optional(),
      bankName: z.string().max(40).optional(),
      mode: z.enum(["fixed", "percent"]).default("fixed"),
      amount: z.number().int().min(0).default(0),
      policyText: z.string().max(500).optional(),
    })
    .default({ enabled: false, mode: "fixed", amount: 0 }),
  // 5) bots
  telegramBotToken: z.string().max(80).optional(),
  baleBotToken: z.string().max(80).optional(),
  // 6) look
  theme: z.enum(["night-gold", "light-editorial", "bold-modern"]).default("night-gold"),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#C9A227"),
  fontHeading: z.enum(["estedad", "vazirmatn", "sahel"]).default("estedad"),
  fontBody: z.enum(["vazirmatn", "sahel"]).default("vazirmatn"),
  // admin login
  adminUsername: z
    .string()
    .regex(/^[a-z0-9_.]{3,30}$/)
    .default("admin"),
  adminPassword: z.string().min(8).max(100),
  // rules (optional overrides)
  bookingRules: z.record(z.string(), z.union([z.number(), z.boolean()])).optional(),
  status: z.enum(["demo", "active"]).default("demo"),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingData = z.output<typeof onboardingSchema>;

/** Sensible starting point so the wizard is never an empty form. */
export const DEFAULT_SERVICES: z.infer<typeof serviceDraft>[] = [
  { name: "اصلاح مو", durationMin: 30, price: 250000 },
  { name: "اصلاح ریش", durationMin: 20, price: 150000 },
  { name: "مو + ریش", durationMin: 50, price: 350000 },
];

/** Saturday–Thursday 10:00–20:00, Friday closed. */
export const DEFAULT_HOURS: z.infer<typeof hoursDraft>[] = Array.from(
  { length: 6 },
  (_, weekday) => ({
    weekday,
    startMin: 10 * 60,
    endMin: 20 * 60,
  }),
);

export const DEFAULT_RULES = DEFAULT_BOOKING_RULES;

export function normalizePhoneOrUndefined(p?: string): string | undefined {
  if (!p) return undefined;
  return normalizeIranMobile(p) ?? p;
}
