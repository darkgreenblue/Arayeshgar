/**
 * The «ادمین‌ها» page (CLAUDE.md §6 path 3).
 *
 * What actually needs proving here is not that the list renders — it is the two things that
 * bite if they are wrong and that nobody would notice until they did:
 *
 *   1. **The panel cannot lock everyone out.** `Ops → admin-remove` is survivable because
 *      ADMIN_IDS restores at boot, but those restored rows have an empty password hash, so
 *      they cannot log into the web panel at all. A web-panel lockout would therefore not be
 *      recoverable by a restart the way the Ops one is.
 *   2. **Revoking an invite really revokes it.** Deactivating a row is the only "take it
 *      back" the page offers, so the code in that row has to stop working the moment it
 *      happens — otherwise the button lies.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, users } from "@arayeshgar/db";
import {
  addPlatformAdminByTelegramId,
  consumeBotLinkCode,
  invitePlatformAdmin,
  listPlatformAdmins,
  setPlatformAdminActive,
} from "../src";
import { makeTenant, testDb } from "./helpers/db";

const db = testDb();

/** An acting admin, so the audit rows point at a real account like they do in the panel. */
async function makeActor(telegramId: number) {
  const { user } = await addPlatformAdminByTelegramId(db, {
    telegramId,
    displayName: "اکتور",
    actorId: "bootstrap",
  });
  return user;
}

async function auditFor(userId: string) {
  return db.query.auditLog.findMany({ where: eq(auditLog.entityId, userId) });
}

describe("platform admin roster (§6 path 3)", () => {
  it("adds an admin from a numeric id and records who did it", async () => {
    const actor = await makeActor(910000001);
    const { user, created } = await addPlatformAdminByTelegramId(db, {
      telegramId: 910000002,
      displayName: "فروشنده رضا",
      actorId: actor.id,
    });
    expect(created).toBe(true);
    expect(user.role).toBe("platform_admin");
    expect(user.tenantId).toBeNull();
    expect(user.displayName).toBe("فروشنده رضا");

    const rows = await auditFor(user.id);
    expect(rows.map((r) => r.action)).toContain("platform_admin.add");
    // Recorded under the acting admin, not "system" — that is the whole point of §6.
    expect(rows[0]?.actorId).toBe(actor.id);
    expect(rows[0]?.tenantId).toBeNull();
  });

  it("restores rather than duplicates when the id already has an account", async () => {
    const actor = await makeActor(910000003);
    const first = await addPlatformAdminByTelegramId(db, {
      telegramId: 910000004,
      actorId: actor.id,
    });
    await db.update(users).set({ isActive: false }).where(eq(users.id, first.user.id));

    const second = await addPlatformAdminByTelegramId(db, {
      telegramId: 910000004,
      actorId: actor.id,
    });
    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.isActive).toBe(true);
    expect((await auditFor(first.user.id)).map((r) => r.action)).toContain(
      "platform_admin.restore",
    );
  });

  it("promotes a tenant's own account when its Telegram id is added", async () => {
    // Same behaviour as `Ops → admin-add`: the two paths must not disagree, or the panel
    // and the workflow end up with different rosters for the same id.
    const f = await makeTenant(db);
    const actor = await makeActor(910000005);
    const { user, created } = await addPlatformAdminByTelegramId(db, {
      telegramId: 111, // the fixture owner's chat id
      actorId: actor.id,
    });
    expect(created).toBe(false);
    expect(user.id).toBe(f.ownerId);
    expect(user.tenantId).toBeNull();

    // Put it back, or cleanup cannot find the row by tenant any more.
    await db.delete(users).where(eq(users.id, f.ownerId));
    await f.cleanup();
  });

  it("refuses a Telegram id that is not a positive integer", async () => {
    const actor = await makeActor(910000006);
    await expect(
      addPlatformAdminByTelegramId(db, { telegramId: 0, actorId: actor.id }),
    ).rejects.toThrow();
    await expect(
      addPlatformAdminByTelegramId(db, { telegramId: -5, actorId: actor.id }),
    ).rejects.toThrow();
    await expect(
      addPlatformAdminByTelegramId(db, { telegramId: 1.5, actorId: actor.id }),
    ).rejects.toThrow();
  });

  it("refuses to let an admin switch off their own account", async () => {
    // Guard one, and the load-bearing one: an admin is active by definition while acting,
    // so refusing self-deactivation is what guarantees one active admin always survives.
    const actor = await makeActor(910000007);
    await expect(
      setPlatformAdminActive(db, { userId: actor.id, isActive: false, actorId: actor.id }),
    ).rejects.toThrow(/حساب خودتان/);
    expect((await db.query.users.findFirst({ where: eq(users.id, actor.id) }))?.isActive).toBe(
      true,
    );
  });

  it("refuses to leave zero active admins even for a caller who is not on the roster", async () => {
    // Guard two. Unreachable from the panel (the actor is always an active admin), so it is
    // exercised here directly — a guard nobody has ever seen fire proves nothing (§15-4).
    // Every other admin is parked inactive first so the target really is the last one.
    const others = await db.query.users.findMany({ where: eq(users.role, "platform_admin") });
    const target = await makeActor(910000008);
    const wasActive = others.filter((o) => o.isActive).map((o) => o.id);
    for (const id of wasActive) {
      await db.update(users).set({ isActive: false }).where(eq(users.id, id));
    }

    await expect(
      setPlatformAdminActive(db, {
        userId: target.id,
        isActive: false,
        actorId: "not-on-the-roster",
      }),
    ).rejects.toThrow(/تنها ادمین فعال/);
    expect((await db.query.users.findFirst({ where: eq(users.id, target.id) }))?.isActive).toBe(
      true,
    );

    // Put back exactly what this test switched off — no more, so later tests see the state
    // they would have seen anyway.
    for (const id of wasActive) {
      await db.update(users).set({ isActive: true }).where(eq(users.id, id));
    }
  });

  it("deactivating burns the unused invite code, so /link stops working", async () => {
    const f = await makeTenant(db);
    const actor = await makeActor(910000009);
    const invite = await invitePlatformAdmin(db, {
      invitedBy: actor.id,
      displayName: "دعوت اشتباهی",
    });

    await setPlatformAdminActive(db, {
      userId: invite.userId,
      isActive: false,
      actorId: actor.id,
    });

    const linked = await consumeBotLinkCode(db, f.tenant.id, invite.code, "telegram", 910000010);
    expect(linked).toBeNull();
    const row = await db.query.users.findFirst({ where: eq(users.id, invite.userId) });
    expect(row?.botLinkCode).toBeNull();
    expect((await auditFor(invite.userId)).map((r) => r.action)).toEqual(
      expect.arrayContaining(["platform_admin.invite", "platform_admin.deactivate"]),
    );

    await db.delete(users).where(eq(users.id, invite.userId));
    await f.cleanup();
  });

  it("refuses a link code on a platform admin deactivated without clearing it", async () => {
    // The case the test above does NOT cover, and the one the `is_active` match in
    // consumeBotLinkCode actually exists for: `Ops → admin-remove` sets is_active = 0 and
    // leaves bot_link_code alone. Without the match, a code issued before the removal would
    // keep working afterwards. Verified by deleting that clause and watching this fail.
    const f = await makeTenant(db);
    const actor = await makeActor(910000015);
    const invite = await invitePlatformAdmin(db, { invitedBy: actor.id });
    await db.update(users).set({ isActive: false }).where(eq(users.id, invite.userId));

    const row = await db.query.users.findFirst({ where: eq(users.id, invite.userId) });
    expect(row?.botLinkCode).toBe(invite.code); // the code really is still there
    expect(
      await consumeBotLinkCode(db, f.tenant.id, invite.code, "telegram", 910000016),
    ).toBeNull();

    await db.delete(users).where(eq(users.id, invite.userId));
    await f.cleanup();
  });

  it("a deactivated tenant admin cannot use their own link code either", async () => {
    // The same tightening applies to the tenant-scoped branch of consumeBotLinkCode: a
    // switched-off barber account must not be able to bind a chat.
    const f = await makeTenant(db);
    await db
      .update(users)
      .set({
        botLinkCode: "515151",
        botLinkCodeExpiresAt: new Date(Date.now() + 60_000),
        isActive: false,
      })
      .where(eq(users.id, f.ownerId));

    expect(await consumeBotLinkCode(db, f.tenant.id, "515151", "telegram", 910000011)).toBeNull();
    await f.cleanup();
  });

  it("reactivates, and lists everyone with their pending invites", async () => {
    const f = await makeTenant(db);
    const actor = await makeActor(910000012);
    const off = await addPlatformAdminByTelegramId(db, {
      telegramId: 910000013,
      actorId: actor.id,
    });
    await setPlatformAdminActive(db, { userId: off.user.id, isActive: false, actorId: actor.id });
    const back = await setPlatformAdminActive(db, {
      userId: off.user.id,
      isActive: true,
      actorId: actor.id,
    });
    expect(back.isActive).toBe(true);

    const invite = await invitePlatformAdmin(db, { invitedBy: actor.id, displayName: "منتظر" });
    const stale = await invitePlatformAdmin(db, { invitedBy: actor.id, displayName: "منقضی" });
    await db
      .update(users)
      .set({ botLinkCodeExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(users.id, stale.userId));

    const list = await listPlatformAdmins(db);
    // Inactive rows stay visible: the roster is also the record of who used to have access.
    const ids = list.map((r) => r.id);
    expect(ids).toContain(off.user.id);
    expect(ids).toContain(invite.userId);
    expect(list.find((r) => r.id === invite.userId)?.pendingInvite).toMatchObject({
      code: invite.code,
      expired: false,
    });
    expect(list.find((r) => r.id === stale.userId)?.pendingInvite?.expired).toBe(true);
    expect(list.find((r) => r.id === actor.id)?.pendingInvite).toBeNull();
    // A barber's own owner account is never on this page, however many of them exist.
    expect(ids).not.toContain(f.ownerId);

    await db.delete(users).where(eq(users.id, invite.userId));
    await db.delete(users).where(eq(users.id, stale.userId));
    await f.cleanup();
  });

  it("refuses to touch a row that is not a platform admin", async () => {
    const f = await makeTenant(db);
    const actor = await makeActor(910000014);
    await expect(
      setPlatformAdminActive(db, { userId: f.ownerId, isActive: false, actorId: actor.id }),
    ).rejects.toThrow();
    await f.cleanup();
  });
});
