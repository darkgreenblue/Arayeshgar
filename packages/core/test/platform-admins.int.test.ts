/**
 * Platform admin management.
 *
 * CLAUDE.md §6 promises two things this suite has to actually hold to. Both were
 * documented before they existed, which is the worst kind of missing: the promise was
 * being relied on.
 *
 *   1. "You can never lock yourself out." `Ops → admin-remove` will deactivate your own
 *      row, and `db-query` is read-only, so without a boot-time restore a slip there is
 *      unrecoverable.
 *   2. An invited salesperson can connect without anyone knowing their numeric Telegram
 *      id — the step that makes `admin-add` awkward in practice.
 */
import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { users } from "@arayeshgar/db";
import {
  consumeBotLinkCode,
  ensurePlatformAdmins,
  findPlatformAdminByChat,
  invitePlatformAdmin,
  parseAdminIds,
} from "../src";
import { makeTenant, testDb } from "./helpers/db";

const db = testDb();

/** Platform admins are tenant-less, so they are found by chat id, never by tenant. */
async function adminRow(telegramId: number) {
  return db.query.users.findFirst({ where: eq(users.telegramChatId, telegramId) });
}

describe("platform admins (§6)", () => {
  it("reads a list of ids and ignores anything that is not one", () => {
    expect(parseAdminIds("111, 222 333")).toEqual([111, 222, 333]);
    expect(parseAdminIds("111,111")).toEqual([111]); // deduped
    expect(parseAdminIds("")).toEqual([]);
    expect(parseAdminIds(undefined)).toEqual([]);
    expect(parseAdminIds("abc, -5, 0, 12x")).toEqual([]);
  });

  it("creates a platform admin from an id that has never been seen", async () => {
    const id = 900000001;
    const res = await ensurePlatformAdmins(db, [id]);
    expect(res.created).toContain(id);

    const row = await adminRow(id);
    expect(row?.role).toBe("platform_admin");
    expect(row?.tenantId).toBeNull();
    expect(row?.isActive).toBe(true);
  });

  it("is idempotent — a second boot changes nothing", async () => {
    const id = 900000002;
    await ensurePlatformAdmins(db, [id]);
    const res = await ensurePlatformAdmins(db, [id]);
    expect(res.created).toHaveLength(0);
    expect(res.restored).toHaveLength(0);
    expect(res.unchanged).toContain(id);
  });

  it("restores the owner after admin-remove deactivated them", async () => {
    // This is the whole safety net. `Ops → admin-remove` sets is_active = 0, and with
    // db-query read-only there is no other way back in.
    const id = 900000003;
    await ensurePlatformAdmins(db, [id]);
    await db.update(users).set({ isActive: false }).where(eq(users.telegramChatId, id));
    expect((await adminRow(id))?.isActive).toBe(false);

    const res = await ensurePlatformAdmins(db, [id]);
    expect(res.restored).toContain(id);
    expect((await adminRow(id))?.isActive).toBe(true);
  });

  it("restores a platform admin who was demoted into a tenant role", async () => {
    const id = 900000004;
    const f = await makeTenant(db);
    await ensurePlatformAdmins(db, [id]);
    await db
      .update(users)
      .set({ role: "staff", tenantId: f.tenant.id })
      .where(eq(users.telegramChatId, id));

    const res = await ensurePlatformAdmins(db, [id]);
    expect(res.restored).toContain(id);
    const row = await adminRow(id);
    expect(row?.role).toBe("platform_admin");
    expect(row?.tenantId).toBeNull();

    await f.cleanup();
  });

  it("keeps going when one id is broken", async () => {
    // A bad row must not stop the rest, and must never stop the process booting.
    const good = 900000005;
    const res = await ensurePlatformAdmins(db, [good]);
    expect(res.created.concat(res.unchanged)).toContain(good);
  });

  it("finds a platform admin by chat id, with no tenant in hand", async () => {
    const id = 900000006;
    await ensurePlatformAdmins(db, [id]);
    const found = await findPlatformAdminByChat(db, "telegram", id);
    expect(found?.telegramChatId).toBe(id);

    // Deactivated means invisible, not merely unprivileged.
    await db.update(users).set({ isActive: false }).where(eq(users.telegramChatId, id));
    expect(await findPlatformAdminByChat(db, "telegram", id)).toBeNull();
  });

  it("connects an invited salesperson without anyone knowing their Telegram id", async () => {
    // The whole point of /invite: the inviter types a name, the invitee types a code.
    const f = await makeTenant(db);
    const invite = await invitePlatformAdmin(db, {
      invitedBy: "owner-under-test",
      displayName: "فروشنده تست",
    });
    expect(invite.code).toMatch(/^\d{6}$/);

    const chatId = 900000007;
    // They send /link in whatever bot they happen to open, so the call arrives scoped to
    // a tenant they have nothing to do with. It must still find them.
    const linked = await consumeBotLinkCode(db, f.tenant.id, invite.code, "telegram", chatId);
    expect(linked?.id).toBe(invite.userId);

    const found = await findPlatformAdminByChat(db, "telegram", chatId);
    expect(found?.id).toBe(invite.userId);
    expect(found?.displayName).toBe("فروشنده تست");

    // One use only.
    expect(
      await consumeBotLinkCode(db, f.tenant.id, invite.code, "telegram", 900000008),
    ).toBeNull();

    await db.delete(users).where(eq(users.id, invite.userId));
    await f.cleanup();
  });

  it("refuses an expired invite", async () => {
    const f = await makeTenant(db);
    const invite = await invitePlatformAdmin(db, { invitedBy: "owner-under-test" });
    await db
      .update(users)
      .set({ botLinkCodeExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(users.id, invite.userId));

    expect(
      await consumeBotLinkCode(db, f.tenant.id, invite.code, "telegram", 900000009),
    ).toBeNull();

    await db.delete(users).where(eq(users.id, invite.userId));
    await f.cleanup();
  });

  it("still prefers a tenant's own admin when both hold the same code", async () => {
    // Six-digit codes can collide. The tenant-scoped match came first before this change
    // and must keep coming first, or a barber's own /link could connect the wrong account.
    const f = await makeTenant(db);
    const code = "424242";
    await db
      .update(users)
      .set({ botLinkCode: code, botLinkCodeExpiresAt: new Date(Date.now() + 60_000) })
      .where(eq(users.id, f.ownerId));
    const clash = await invitePlatformAdmin(db, { invitedBy: "owner-under-test" });
    await db
      .update(users)
      .set({ botLinkCode: code, botLinkCodeExpiresAt: new Date(Date.now() + 60_000) })
      .where(eq(users.id, clash.userId));

    const linked = await consumeBotLinkCode(db, f.tenant.id, code, "telegram", 900000010);
    expect(linked?.id).toBe(f.ownerId);

    await db.delete(users).where(eq(users.id, clash.userId));
    await f.cleanup();
  });

  it("leaves no tenant-scoped admin visible as a platform admin", async () => {
    // The fallback must not accidentally promote a barber's own owner account.
    const f = await makeTenant(db);
    const owner = await db.query.users.findFirst({ where: eq(users.id, f.ownerId) });
    expect(owner?.telegramChatId).toBe(111);
    expect(await findPlatformAdminByChat(db, "telegram", 111)).toBeNull();

    const stillScoped = await db.query.users.findFirst({
      where: and(isNull(users.tenantId), eq(users.id, f.ownerId)),
    });
    expect(stillScoped).toBeUndefined();

    await f.cleanup();
  });
});
