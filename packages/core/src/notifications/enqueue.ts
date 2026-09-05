/**
 * Turns a domain event into outbox rows for the right recipients.
 * Never sends directly: the worker drains the outbox with retries.
 */
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import {
  notificationOutbox,
  users,
  type Booking,
  type Platform,
  type Tenant,
} from "@arayeshgar/db";
import type { DbLike } from "../availability/availability";
import { logger } from "../logger";
import type { BookingPayload, NotificationKind } from "./events";

export type Recipient = { channel: Platform; chatId: string };

/**
 * Admin recipients follow the salon scenario:
 *  solo / salon_central  -> owner + manager users with a linked chat
 *  salon_independent     -> the staff member's own user (+ managers, if any)
 */
export async function adminRecipients(
  db: DbLike,
  tenant: Tenant,
  staffId: string,
): Promise<Recipient[]> {
  const roleFilter =
    tenant.mode === "salon_independent"
      ? or(
          and(eq(users.role, "staff"), eq(users.staffId, staffId)),
          inArray(users.role, ["owner", "manager"]),
        )
      : inArray(users.role, ["owner", "manager"]);
  const rows = await db
    .select({
      tg: users.telegramChatId,
      bale: users.baleChatId,
      role: users.role,
      staffId: users.staffId,
    })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenant.id),
        eq(users.isActive, true),
        roleFilter,
        or(isNotNull(users.telegramChatId), isNotNull(users.baleChatId)),
      ),
    );

  // In salon_independent the owner/manager only gets a copy if no staff user is linked (avoid double-handling).
  const staffLinked =
    tenant.mode === "salon_independent" &&
    rows.some((r) => r.role === "staff" && r.staffId === staffId);
  const out: Recipient[] = [];
  for (const r of rows) {
    if (staffLinked && r.role !== "staff") continue;
    if (r.tg != null && tenant.features.telegram_bot)
      out.push({ channel: "telegram", chatId: String(r.tg) });
    if (r.bale != null && tenant.features.bale_bot)
      out.push({ channel: "bale", chatId: String(r.bale) });
  }
  return out;
}

/** Customer recipient: only if the booking came from a chat channel (web customers track via /b/{code}). */
export function customerRecipient(
  booking: Pick<Booking, "source">,
  platformUserId: string | null,
): Recipient | null {
  if (!platformUserId) return null;
  if (booking.source === "telegram") return { channel: "telegram", chatId: platformUserId };
  if (booking.source === "bale") return { channel: "bale", chatId: platformUserId };
  return null;
}

export async function enqueue(
  db: DbLike,
  tenantId: string,
  kind: NotificationKind,
  recipients: Recipient[],
  payload: BookingPayload,
): Promise<number> {
  if (recipients.length === 0) return 0;
  await db.insert(notificationOutbox).values(
    recipients.map((r) => ({
      tenantId,
      channel: r.channel,
      recipientChatId: r.chatId,
      kind,
      payload: payload as unknown as Record<string, unknown>,
    })),
  );
  logger.debug(
    { tenantId, kind, count: recipients.length, bookingId: payload.bookingId },
    "notifications enqueued",
  );
  return recipients.length;
}
