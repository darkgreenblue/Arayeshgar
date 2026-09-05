/**
 * Webhook registration. URL carries the tenant and a per-tenant secret:
 *   <BOTS_PUBLIC_URL>/hooks/<platform>/<tenantId>/<webhookSecret>
 * Telegram also supports a secret header, but Bale may not send one, so the URL secret is the
 * primary check and the header is treated as a bonus.
 */
import type { Bot } from "grammy";
import type { Platform, Tenant } from "@arayeshgar/db";
import { getEnv, logger, withRetry } from "@arayeshgar/core";
import type { BotCtx } from "./bot";

export function webhookPath(
  tenant: Pick<Tenant, "id" | "webhookSecret">,
  platform: Platform,
): string {
  return `/hooks/${platform}/${tenant.id}/${tenant.webhookSecret}`;
}

export function webhookUrl(
  tenant: Pick<Tenant, "id" | "webhookSecret">,
  platform: Platform,
): string {
  return `${getEnv().BOTS_PUBLIC_URL.replace(/\/$/, "")}${webhookPath(tenant, platform)}`;
}

/** Idempotent: only calls setWebhook when the registered URL differs. */
export async function ensureWebhook(
  bot: Bot<BotCtx>,
  tenant: Tenant,
  platform: Platform,
): Promise<"unchanged" | "updated"> {
  const url = webhookUrl(tenant, platform);
  const info = await withRetry(() => bot.api.getWebhookInfo(), {
    label: `${platform}.getWebhookInfo`,
    attempts: 2,
  });
  if (info.url === url) return "unchanged";
  await withRetry(
    () =>
      bot.api.setWebhook(url, {
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
        ...(platform === "telegram" ? { secret_token: tenant.webhookSecret.slice(0, 64) } : {}),
      }),
    { label: `${platform}.setWebhook`, attempts: 3 },
  );
  logger.info({ tenantId: tenant.id, platform, url }, "webhook registered");
  return "updated";
}
