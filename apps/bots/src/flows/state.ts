/**
 * Minimal persisted conversation state: only "waiting for phone" and "waiting for receipt photo".
 * Everything else travels in callback_data, so a restart never strands a customer mid-flow.
 */
import { and, eq } from "drizzle-orm";
import { botSessions, type Db, type Platform } from "@arayeshgar/db";

export type BotState =
  | { await: "phone"; svc: string; stf?: string; t: string }
  | { await: "receipt"; b: string }
  | Record<string, never>;

export async function getState(
  db: Db,
  tenantId: string,
  platform: Platform,
  userId: string,
): Promise<BotState | null> {
  const [row] = await db
    .select({ state: botSessions.state })
    .from(botSessions)
    .where(
      and(
        eq(botSessions.tenantId, tenantId),
        eq(botSessions.platform, platform),
        eq(botSessions.platformUserId, userId),
      ),
    );
  return (row?.state as BotState) ?? null;
}

export async function setState(
  db: Db,
  tenantId: string,
  platform: Platform,
  userId: string,
  state: BotState,
): Promise<void> {
  await db
    .insert(botSessions)
    .values({ tenantId, platform, platformUserId: userId, state, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [botSessions.tenantId, botSessions.platform, botSessions.platformUserId],
      set: { state, updatedAt: new Date() },
    });
}

export async function clearState(
  db: Db,
  tenantId: string,
  platform: Platform,
  userId: string,
): Promise<void> {
  await db
    .delete(botSessions)
    .where(
      and(
        eq(botSessions.tenantId, tenantId),
        eq(botSessions.platform, platform),
        eq(botSessions.platformUserId, userId),
      ),
    );
}
