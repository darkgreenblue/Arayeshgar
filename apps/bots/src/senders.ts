/**
 * Outbox senders. The worker hands us a row; we render it with core's platform-agnostic renderer
 * and deliver it through the right bot. Receipt photos are streamed from storage as multipart so
 * no public URL is ever exposed.
 */
import { InputFile } from "grammy";
import { eq } from "drizzle-orm";
import { tenants, type Db, type OutboxRow, type Platform, type Tenant } from "@arayeshgar/db";
import {
  getStorage,
  logger,
  renderNotification,
  type BookingPayload,
  type NotificationKind,
} from "@arayeshgar/core";
import { getBot } from "./platform/bot";
import { getSharedDemoBot } from "./platform/demo";
import { toInlineKeyboard } from "./platform/keyboard";
import type { Senders } from "@arayeshgar/core";
import { registerAll } from "./register";

const tenantCache = new Map<string, { tenant: Tenant; at: number }>();
const TTL = 30_000;

async function loadTenant(db: Db, tenantId: string): Promise<Tenant | null> {
  const hit = tenantCache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL) return hit.tenant;
  const t = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  if (t) tenantCache.set(tenantId, { tenant: t, at: Date.now() });
  return t ?? null;
}

export function invalidateTenant(tenantId: string) {
  tenantCache.delete(tenantId);
}

/**
 * The tenant's own bot when it has a token, otherwise the shared demo bot. A prospect's
 * notifications have to come out of the same bot they are talking to, or the reply would
 * arrive from a bot they have never opened — which Telegram would refuse to deliver.
 */
async function botFor(db: Db, tenant: Tenant, platform: Platform) {
  const own = await getBot(db, tenant, platform, (b) => registerAll(b, db));
  if (own) return own;
  if (tenant.status !== "demo") return null;
  return getSharedDemoBot(db, platform, (b) => registerAll(b, db));
}

async function send(db: Db, platform: Platform, row: OutboxRow): Promise<void> {
  const tenant = await loadTenant(db, row.tenantId);
  if (!tenant) throw new Error(`tenant ${row.tenantId} not found`);
  const featureOn =
    platform === "telegram" ? tenant.features.telegram_bot : tenant.features.bale_bot;
  if (!featureOn) {
    logger.info({ tenantId: tenant.id, platform }, "channel disabled; dropping notification");
    return; // treated as sent: the tenant turned this channel off
  }
  const bot = await botFor(db, tenant, platform);
  if (!bot) throw new Error(`no ${platform} bot for tenant ${tenant.id}`);

  const payload = row.payload as unknown as BookingPayload;
  const msg = renderNotification(row.kind as NotificationKind, payload);
  const keyboard = toInlineKeyboard(msg.buttons);
  const chatId = row.recipientChatId;

  if (msg.photoPath) {
    const storage = getStorage();
    if (await storage.exists(msg.photoPath)) {
      await bot.api.sendPhoto(chatId, new InputFile(storage.absolutePath(msg.photoPath)), {
        caption: msg.text.slice(0, 1000),
        ...(keyboard ? { reply_markup: keyboard } : {}),
      });
      return;
    }
    logger.warn(
      { tenantId: tenant.id, path: msg.photoPath },
      "receipt file missing; sending text only",
    );
  }
  await bot.api.sendMessage(chatId, msg.text, keyboard ? { reply_markup: keyboard } : {});
}

export function createSenders(db: Db): Senders {
  return {
    telegram: (row) => send(db, "telegram", row),
    bale: (row) => send(db, "bale", row),
  };
}
