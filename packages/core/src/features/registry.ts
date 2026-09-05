/**
 * Central feature-flag registry. Every optional module checks `isEnabled(tenant, key)` in the UI,
 * the API and the bots. The platform panel toggles these per tenant.
 */
export const FEATURES = {
  deposit: {
    label: "بیعانه کارت‌به‌کارت",
    description: "رزرو فقط با پرداخت بیعانه و آپلود رسید نهایی می‌شود",
    mvp: true,
  },
  telegram_bot: { label: "ربات تلگرام", description: "رزرو و نوتیفیکیشن در تلگرام", mvp: true },
  bale_bot: { label: "ربات بله", description: "رزرو و نوتیفیکیشن در بله", mvp: true },
  gallery: { label: "گالری", description: "بخش نمونه‌کارها در سایت", mvp: true },
  reviews: { label: "نظرات", description: "نمایش نظرات مشتریان در سایت", mvp: true },
  faq: { label: "سؤالات متداول", description: "بخش FAQ در سایت", mvp: true },
  map: { label: "نقشه", description: "لینک نشان/بلد/گوگل‌مپ در سایت", mvp: true },
  manual_slots: {
    label: "اسلات‌های دستی",
    description: "به‌جای ساعت کاری هفتگی، آرایشگر خودش وقت‌ها را باز می‌کند",
    mvp: true,
  },
  customer_cancel: {
    label: "کنسل توسط مشتری",
    description: "مشتری تا X ساعت قبل می‌تواند خودش کنسل کند",
    mvp: true,
  },
  reminders: { label: "یادآوری", description: "پیام یادآوری ۲۴ ساعت قبل از نوبت", mvp: true },
  ai_copy: {
    label: "متن‌نویسی هوشمند",
    description: "تولید متن‌های سایت در آنبوردینگ با AI",
    mvp: true,
  },
  sms_otp: {
    label: "تأیید پیامکی",
    description: "کد تأیید موبایل برای رزرو وب (آینده)",
    mvp: false,
  },
  photo_upload: {
    label: "عکس مو قبل از مراجعه",
    description: "مشتری عکس موی خود را قبل از نوبت می‌فرستد (آینده)",
    mvp: false,
  },
  waitlist: {
    label: "لیست انتظار",
    description: "اطلاع‌رسانی وقتی اسلات پر آزاد شد (آینده)",
    mvp: false,
  },
} as const;

export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export function isEnabled(tenant: { features: Record<string, boolean> }, key: FeatureKey): boolean {
  return tenant.features[key] === true;
}

/** Returns a full flag map (unknown keys dropped, missing keys false). */
export function normalizeFeatures(
  input: Record<string, unknown> | null | undefined,
): Record<FeatureKey, boolean> {
  const out = {} as Record<FeatureKey, boolean>;
  for (const k of FEATURE_KEYS) out[k] = input?.[k] === true;
  return out;
}
