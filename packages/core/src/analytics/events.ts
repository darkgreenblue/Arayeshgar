/**
 * Analytics events — §9ب of PLATFORM.md, contract version 3.
 *
 * Two rules from the contract shape everything here:
 *
 *   1. **Recording is fail-safe.** An analytics write must never break a booking. Every
 *      call swallows its own errors and logs them; nothing upstream awaits a result it
 *      could act on.
 *   2. **Names are immutable.** An event name or prop that has shipped is never renamed
 *      or removed, only added to, because historical analysis and the shared dashboard
 *      break silently rather than loudly when it changes.
 *
 * The shared vocabulary is fixed across every product on the server. Product-specific
 * names are allowed but must not be a synonym of a shared one — so "the appointment
 * happened" is `product_delivered`, not a new `booking_completed`.
 */
import { createHash } from "node:crypto";
import { events, type Db, type Tx } from "@arayeshgar/db";
import { logger } from "../logger";

/** The dictionary every product on this server shares. Never extend this list locally. */
export const SHARED_EVENTS = [
  "start",
  "onboard_done",
  "first_value",
  "paywall_shown",
  "recharge_started",
  "receipt_submitted",
  "payment_approved",
  "payment_rejected",
  "product_delivered",
  "refund",
  "feedback",
  "reset",
] as const;

/**
 * Names specific to booking. Each is something the shared vocabulary has no word for:
 * a booking's lifecycle is richer than "delivered or not".
 */
export const PRODUCT_EVENTS = [
  "booking_created",
  "booking_confirmed",
  "booking_cancelled",
  "booking_rescheduled",
  "booking_expired",
  "no_show",
  "tenant_created",
] as const;

export type EventName = (typeof SHARED_EVENTS)[number] | (typeof PRODUCT_EVENTS)[number];

/**
 * A stable, negative id for a customer who has no chat id.
 *
 * The contract's user_id is an INTEGER because it assumes every user arrives through
 * Telegram. Ours often do not — a customer can book on the website and never open a bot.
 * Hashing their customer id gives that person one consistent id across their events, and
 * keeping it negative means it can never be mistaken for, or collide with, a real chat id.
 */
export function syntheticUserId(customerId: string): number {
  const digest = createHash("sha256").update(customerId).digest();
  // 31 bits keeps it inside a safe integer and away from the sign bit before negating.
  const positive = digest.readUInt32BE(0) & 0x7fffffff;
  return -(positive || 1);
}

export type TrackInput = {
  event: EventName;
  /** Chat id when the event came from a bot; syntheticUserId(...) for the website. */
  userId?: number | null;
  /** Merged into props. The contract has no tenant column, and this product has many. */
  tenantId?: string;
  props?: Record<string, unknown>;
  at?: Date;
};

/**
 * Records one event. Never throws and never rejects: callers `void` it or await it
 * purely for ordering, and a failure here must leave the user's flow untouched.
 */
export async function track(db: Db | Tx, input: TrackInput): Promise<void> {
  try {
    await db.insert(events).values({
      event: input.event,
      userId: input.userId ?? null,
      props: { ...(input.tenantId ? { tenant_id: input.tenantId } : {}), ...(input.props ?? {}) },
      createdAt: input.at ?? new Date(),
    });
  } catch (err) {
    logger.error(
      { event: input.event, tenantId: input.tenantId, err: String(err) },
      "analytics write failed; continuing",
    );
  }
}
