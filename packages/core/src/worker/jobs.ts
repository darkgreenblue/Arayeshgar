/**
 * Periodic jobs. Each is idempotent and safe to run from several processes.
 */
import { and, eq, inArray, isNull, lte, gte, sql } from "drizzle-orm";
import type { Db } from "@arayeshgar/db";
import { bookings, tenants } from "@arayeshgar/db";
import { logger } from "../logger";
import { expireBooking, loadBookingContext } from "../booking/transitions";
import { customerRecipient, enqueue } from "../notifications/enqueue";
import { toPayload } from "../booking/payload";
import { drainOutbox, type Senders } from "../notifications/outbox";
import { isEnabled } from "../features/registry";
import { tenantPublicUrl, getEnv } from "../env";

/** pending_payment bookings past their deadline -> expired (slot freed) + customer notified. */
export async function expireBookings(db: Db, now = new Date()): Promise<number> {
  // SQLite stores `mode: "timestamp"` as a Unix timestamp in seconds. Passing a JavaScript
  // Date through the libSQL driver made this comparison an integer-to-text comparison, which
  // SQLite considers true for every pending payment. Bind a numeric Unix timestamp explicitly.
  const nowEpochSeconds = Math.floor(now.getTime() / 1_000);
  const due = await db
    .select({ id: bookings.id, tenantId: bookings.tenantId })
    .from(bookings)
    .where(
      and(eq(bookings.status, "pending_payment"), sql`${bookings.expiresAt} < ${nowEpochSeconds}`),
    )
    .limit(200);
  let n = 0;
  for (const b of due) {
    try {
      await expireBooking(db, b.tenantId, b.id);
      n++;
    } catch (err) {
      logger.warn({ bookingId: b.id, err: String(err) }, "expire skipped (state changed)");
    }
  }
  if (n) logger.info({ expired: n }, "expired unpaid bookings");
  return n;
}

/** Confirmed bookings starting in 23..25h that have not been reminded yet. */
export async function enqueueReminders(db: Db, now = new Date()): Promise<number> {
  const from = new Date(now.getTime() + 23 * 3_600_000);
  const to = new Date(now.getTime() + 25 * 3_600_000);
  const rows = await db
    .select({ id: bookings.id, tenantId: bookings.tenantId })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "confirmed"),
        isNull(bookings.reminder24hSentAt),
        gte(bookings.startAt, from),
        lte(bookings.startAt, to),
      ),
    )
    .limit(200);
  let n = 0;
  const env = getEnv();
  for (const r of rows) {
    const ctx = await loadBookingContext(db, r.tenantId, r.id);
    if (!ctx) continue;
    // Mark first (conditional) so two workers never double-send.
    const marked = await db
      .update(bookings)
      .set({ reminder24hSentAt: now })
      .where(and(eq(bookings.id, r.id), isNull(bookings.reminder24hSentAt)))
      .returning({ id: bookings.id });
    if (!marked.length) continue;
    if (!isEnabled(ctx.tenant, "reminders")) continue;
    const rec = customerRecipient(ctx.booking, ctx.identityChatId);
    if (rec) {
      await enqueue(
        db,
        ctx.tenant.id,
        "reminder_24h",
        [rec],
        toPayload(ctx, "customer", tenantPublicUrl(env, ctx.tenant)),
      );
      n++;
    }
  }
  return n;
}

export type TickResult = { expired: number; reminders: number; sent: number; failed: number };

export async function runWorkerTick(db: Db, senders: Senders): Promise<TickResult> {
  const expired = await expireBookings(db);
  const reminders = await enqueueReminders(db);
  const { sent, failed } = await drainOutbox(db, senders);
  return { expired, reminders, sent, failed };
}

/** setInterval loop with an overlap guard. Returns a stop function. */
export function startWorker(db: Db, senders: Senders, intervalSec: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runWorkerTick(db, senders);
      if (r.expired || r.reminders || r.sent || r.failed) logger.info(r, "worker tick");
    } catch (err) {
      logger.error({ err: String(err) }, "worker tick crashed");
    } finally {
      running = false;
    }
  };
  void tick();
  const handle = setInterval(tick, intervalSec * 1000);
  return () => clearInterval(handle);
}

/** Tenants whose bots are enabled (used by the bots app to register webhooks). */
export async function activeTenants(db: Db) {
  return db
    .select()
    .from(tenants)
    .where(inArray(tenants.status, ["demo", "active"]));
}
