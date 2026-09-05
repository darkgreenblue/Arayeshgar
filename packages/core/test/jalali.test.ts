import { describe, expect, it } from "vitest";
import {
  formatInstantFa,
  jalaliKey,
  localToInstant,
  parseJalaliKey,
  persianWeekday,
  toJalali,
  tzOffsetMinutes,
} from "../src/utils/jalali";

describe("jalali/tehran helpers", () => {
  it("Tehran offset is +03:30 year-round", () => {
    expect(tzOffsetMinutes(new Date("2026-01-15T00:00:00Z"))).toBe(210);
    expect(tzOffsetMinutes(new Date("2026-07-15T00:00:00Z"))).toBe(210);
  });
  it("converts local wall clock to instant", () => {
    // 2026-09-05 14:30 Tehran == 11:00Z
    expect(localToInstant({ y: 2026, m: 9, d: 5 }, 14 * 60 + 30).toISOString()).toBe(
      "2026-09-05T11:00:00.000Z",
    );
  });
  it("Persian weekday: 2026-09-05 is a Saturday => 0", () => {
    expect(persianWeekday({ y: 2026, m: 9, d: 5 })).toBe(0);
    expect(persianWeekday({ y: 2026, m: 9, d: 11 })).toBe(6); // Friday
  });
  it("Jalali round trip", () => {
    const j = toJalali({ y: 2026, m: 9, d: 5 });
    expect(j).toEqual({ jy: 1405, jm: 6, jd: 14 });
    const key = jalaliKey({ y: 2026, m: 9, d: 5 });
    expect(key).toBe("1405/06/14");
    expect(parseJalaliKey(key)).toEqual({ y: 2026, m: 9, d: 5 });
    expect(parseJalaliKey("1405/13/01")).toBeNull();
  });
  it("formats an instant in Persian", () => {
    expect(formatInstantFa(new Date("2026-09-05T11:00:00Z"))).toBe("شنبه ۱۴ شهریور، ساعت ۱۴:۳۰");
  });
});
