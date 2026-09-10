/**
 * The analytics contract (§9ب of PLATFORM.md, contract version 3).
 *
 * §9ب asks for "a simple check that the copy does not diverge from the contract", and
 * this is it. The shared dashboard reads every product's `events` table with the same
 * queries, so a column renamed here would not fail anything — it would just make this
 * product quietly invisible, or worse, wrong. The DDL is therefore asserted literally.
 *
 * The second half is the rule that actually costs money to get wrong: recording an
 * event must never break a booking.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { events, type Db } from "@arayeshgar/db";
import {
  PRODUCT_EVENTS,
  SHARED_EVENTS,
  syntheticUserId,
  track,
  createBooking,
  markCompleted,
} from "../src";
import { makeTenant, testDb, tomorrowAt } from "./helpers/db";

const db = testDb();

/** The columns and indexes §9ب fixes across every product. */
const CONTRACT_COLUMNS: Record<string, { type: string; notnull: number }> = {
  // The contract writes `id INTEGER PRIMARY KEY AUTOINCREMENT` without an explicit
  // NOT NULL; drizzle emits one. Identical in SQLite — an INTEGER PRIMARY KEY *is* the
  // rowid and can never be null — so the flag is asserted as emitted, not as written.
  id: { type: "integer", notnull: 1 },
  user_id: { type: "integer", notnull: 0 },
  event: { type: "text", notnull: 1 },
  props: { type: "text", notnull: 1 },
  created_at: { type: "integer", notnull: 1 },
};

describe("analytics contract (§9ب)", () => {
  it("keeps the events table exactly as the shared dashboard expects", async () => {
    const cols = (await db.all(sql`PRAGMA table_info(events)`)) as {
      name: string;
      type: string;
      notnull: number;
    }[];
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));

    expect(Object.keys(byName).sort()).toEqual(Object.keys(CONTRACT_COLUMNS).sort());
    for (const [name, want] of Object.entries(CONTRACT_COLUMNS)) {
      expect(byName[name]!.type.toLowerCase()).toBe(want.type);
      expect(byName[name]!.notnull).toBe(want.notnull);
    }

    // AUTOINCREMENT and the unixepoch default are part of the contract, not decoration.
    const [ddl] = (await db.all(
      sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'events'`,
    )) as { sql: string }[];
    expect(ddl!.sql).toContain("AUTOINCREMENT");
    expect(ddl!.sql).toContain("unixepoch()");

    const indexes = (await db.all(
      sql`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'events'`,
    )) as { name: string }[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_events_user");
    expect(names).toContain("idx_events_event");
  });

  it("does not invent a shared event name or shadow one with a product name", () => {
    // §9ب: a product-specific name is allowed, but never as a synonym of a shared one.
    const shared = new Set<string>(SHARED_EVENTS);
    for (const name of PRODUCT_EVENTS) expect(shared.has(name)).toBe(false);
    expect(new Set(SHARED_EVENTS).size).toBe(SHARED_EVENTS.length);
    expect(new Set(PRODUCT_EVENTS).size).toBe(PRODUCT_EVENTS.length);
  });

  it("gives a website customer a stable id that cannot collide with a chat id", () => {
    const a = syntheticUserId("11111111-2222-3333-4444-555555555555");
    const b = syntheticUserId("11111111-2222-3333-4444-555555555555");
    const c = syntheticUserId("99999999-8888-7777-6666-555555555555");
    expect(a).toBe(b); // same customer, same id, every time
    expect(a).not.toBe(c);
    expect(a).toBeLessThan(0); // real Telegram chat ids are positive
    expect(Number.isSafeInteger(a)).toBe(true);
  });

  it("never breaks the caller when the write fails", async () => {
    // A dead database is the harshest version of "analytics is down". The booking flow
    // must not care, so this must resolve rather than throw.
    const broken = {
      insert: () => {
        throw new Error("database is gone");
      },
    } as unknown as Db;
    await expect(track(broken, { event: "start" })).resolves.toBeUndefined();
  });

  it("records the real booking lifecycle with tenant context", async () => {
    const f = await makeTenant(db);
    const before = ((await db.select().from(events)) as { event: string }[]).length;

    const booked = await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(10),
      customer: { name: "مشتری آنالیتیکس", phone: "09121230000" },
      source: "web",
    });
    await markCompleted(db, f.tenant.id, booked.bookingId, f.ownerId);

    const rows = (await db.select().from(events)) as {
      event: string;
      userId: number | null;
      props: Record<string, unknown>;
    }[];
    expect(rows.length).toBeGreaterThan(before);
    const mine = rows.filter((r) => r.props.tenant_id === f.tenant.id);
    const names = mine.map((r) => r.event);

    // A first-time customer produces both the shared "got value" event and ours.
    expect(names).toContain("first_value");
    expect(names).toContain("booking_created");
    expect(names).toContain("product_delivered");

    // Every row carries the tenant, since the contract has no column for it.
    for (const r of mine) expect(r.props.tenant_id).toBe(f.tenant.id);
    // And a web customer is identified by the synthetic, negative id.
    for (const r of mine.filter((x) => x.event !== "tenant_created")) {
      if (r.userId !== null) expect(r.userId).toBeLessThan(0);
    }

    await f.cleanup();
  });

  it("counts first_value only once per customer", async () => {
    const f = await makeTenant(db);
    const customer = { name: "مشتری دوباره", phone: "09121230001" };
    await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(11),
      customer,
      source: "web",
    });
    await createBooking(db, {
      tenant: f.tenant,
      staffId: f.staffId,
      serviceId: f.serviceId,
      startAt: tomorrowAt(12),
      customer,
      source: "web",
    });

    const rows = (await db.select().from(events)) as {
      event: string;
      props: Record<string, unknown>;
    }[];
    const mine = rows.filter((r) => r.props.tenant_id === f.tenant.id);
    expect(mine.filter((r) => r.event === "first_value")).toHaveLength(1);
    expect(mine.filter((r) => r.event === "booking_created")).toHaveLength(2);

    await f.cleanup();
  });
});
