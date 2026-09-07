/**
 * Outbox drain: claim due rows, hand each to the channel sender, then mark sent or
 * schedule a retry with exponential backoff.
 *
 * Postgres claimed rows with FOR UPDATE SKIP LOCKED so several workers could drain in
 * parallel. SQLite has no row locks and needs none: only one writer runs at a time, and
 * the claim below opens with BEGIN IMMEDIATE, so a second worker either waits and then
 * sees the bumped next_try_at, or is not running at all. The claim is still a single
 * transaction that both selects and stamps the rows, which is what keeps a crash
 * mid-send from turning into a tight resend loop.
 */
import { and, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { notificationOutbox, type Db, type OutboxRow, type Platform } from "@arayeshgar/db";
import { logger } from "../logger";

export type Sender = (row: OutboxRow) => Promise<void>;
export type Senders = Partial<Record<Platform, Sender>>;

const MAX_ATTEMPTS = 8;

export function backoffSeconds(attempt: number): number {
  return Math.min(6 * 3600, 30 * 2 ** Math.max(0, attempt - 1)); // 30s, 1m, 2m, ... capped at 6h
}

export async function drainOutbox(
  db: Db,
  senders: Senders,
  batch = 25,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  // Claim rows in a short transaction so other workers skip them.
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(notificationOutbox)
      .where(
        and(
          isNull(notificationOutbox.sentAt),
          lte(notificationOutbox.nextTryAt, new Date()),
          lt(notificationOutbox.attempts, MAX_ATTEMPTS),
        ),
      )
      .orderBy(notificationOutbox.nextTryAt)
      .limit(batch);
    if (rows.length) {
      // Bump attempts and push next_try_at into the future immediately: a crash mid-send cannot cause a tight loop.
      await tx
        .update(notificationOutbox)
        .set({
          attempts: sql`${notificationOutbox.attempts} + 1`,
          nextTryAt: new Date(Date.now() + 5 * 60_000),
        })
        .where(
          inArray(
            notificationOutbox.id,
            rows.map((r) => r.id),
          ),
        );
    }
    return rows;
  });

  for (const row of claimed) {
    const sender = senders[row.channel];
    const log = logger.child({
      outboxId: row.id,
      tenantId: row.tenantId,
      channel: row.channel,
      kind: row.kind,
    });
    if (!sender) {
      log.warn("no sender registered for channel; leaving for retry");
      continue;
    }
    try {
      await sender(row);
      await db
        .update(notificationOutbox)
        .set({ sentAt: new Date(), lastError: null })
        .where(eq(notificationOutbox.id, row.id));
      sent++;
    } catch (err) {
      failed++;
      const attempt = row.attempts + 1;
      const delay = backoffSeconds(attempt);
      const msg = String(err instanceof Error ? err.message : err).slice(0, 500);
      log.error({ err: msg, attempt, retryInSec: delay }, "notification send failed");
      await db
        .update(notificationOutbox)
        .set({ lastError: msg, nextTryAt: new Date(Date.now() + delay * 1000) })
        .where(eq(notificationOutbox.id, row.id));
    }
  }
  return { sent, failed };
}
