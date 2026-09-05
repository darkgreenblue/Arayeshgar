import { describe, expect, it } from "vitest";
import {
  decode,
  encode,
  matchesShort,
  packTime,
  shortId,
  unpackTime,
} from "../src/platform/callback";

describe("callback codec", () => {
  it("round-trips every action and stays inside the 64-byte budget", () => {
    const svc = shortId("9a0e6d49-990d-4350-b726-37b13260605e");
    const stf = shortId("e8216667-68da-4f16-9c88-b46460960cbb");
    const t = packTime(new Date("2026-09-06T06:30:00Z"));
    const cases = [
      { a: "svc", svc },
      { a: "stf", svc, stf },
      { a: "day", svc, stf, day: "1405/06/15" },
      { a: "slot", svc, stf, day: "1405/06/15", t },
      { a: "back", to: "stf" },
      { a: "receipt", b: svc },
      { a: "approve", b: svc },
      { a: "adm", v: "pending" },
      { a: "noop" },
    ] as const;
    for (const c of cases) {
      const s = encode(c);
      expect(Buffer.byteLength(s)).toBeLessThanOrEqual(64);
      expect(decode(s)).toEqual(c);
    }
  });
  it("rejects malformed or foreign data", () => {
    expect(decode("garbage")).toBeNull();
    expect(decode("v2|svc|abc")).toBeNull();
    expect(decode("v1|svc")).toBeNull();
    expect(decode("v1|slot|a|b|c")).toBeNull();
  });
  it("short ids identify a uuid without carrying it", () => {
    const id = "9a0e6d49-990d-4350-b726-37b13260605e";
    expect(shortId(id)).toBe("9a0e6d49");
    expect(matchesShort(id, "9a0e6d49")).toBe(true);
    expect(matchesShort("11111111-2222-3333-4444-555555555555", "9a0e6d49")).toBe(false);
  });
  it("packs an instant to minute precision", () => {
    const d = new Date("2026-09-06T06:30:00.000Z");
    expect(unpackTime(packTime(d)).toISOString()).toBe(d.toISOString());
    expect(packTime(d).length).toBeLessThanOrEqual(7);
  });
});
