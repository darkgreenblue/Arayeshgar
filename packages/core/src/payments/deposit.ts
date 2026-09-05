import type { DepositSettings } from "@arayeshgar/db";

/** Deposit amount in Toman for a service price, rounded to the nearest 1,000. 0 when disabled. */
export function computeDeposit(settings: DepositSettings, servicePrice: number): number {
  if (!settings.enabled || settings.amount <= 0) return 0;
  const raw =
    settings.mode === "percent" ? (servicePrice * settings.amount) / 100 : settings.amount;
  const rounded = Math.round(raw / 1000) * 1000;
  return Math.min(Math.max(rounded, 0), servicePrice);
}
