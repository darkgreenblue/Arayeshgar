import type { BookingRules, DepositSettings, TenantBranding, TenantFeatures } from "./schema";

/** Defaults applied to every new tenant; the onboarding wizard overrides what it asks for. */
export const DEFAULT_BOOKING_RULES: BookingRules = {
  slotStepMin: 15,
  bufferMin: 0,
  minLeadMin: 60,
  horizonDays: 14,
  paymentDeadlineMin: 30,
  cancelBeforeHours: 4,
  autoConfirmWithoutDeposit: true,
  maxActiveBookingsPerPhone: 1,
  maxBookingsPerPhonePerDay: 3,
};

export const DEFAULT_DEPOSIT_SETTINGS: DepositSettings = {
  enabled: false,
  mode: "fixed",
  amount: 0,
};

/** Feature flags every tenant starts with. Keys are defined in @arayeshgar/core/features. */
export const DEFAULT_FEATURES: TenantFeatures = {
  deposit: false,
  telegram_bot: true,
  bale_bot: true,
  gallery: true,
  reviews: false,
  faq: true,
  map: true,
  manual_slots: false,
  customer_cancel: true,
  reminders: true,
  ai_copy: false,
  sms_otp: false,
  photo_upload: false,
  waitlist: false,
};

export function defaultBranding(displayName: string): TenantBranding {
  return {
    displayName,
    gallery: [],
    primaryColor: "#C9A227",
    fontHeading: "estedad",
    fontBody: "vazirmatn",
    faq: [],
  };
}
