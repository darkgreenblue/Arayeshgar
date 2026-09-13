import { describe, expect, it } from "vitest";
import {
  formatCardNumber,
  isolate,
  formatToman,
  normalizeIranMobile,
  toPersianDigits,
} from "../src/utils/phone";

describe("normalizeIranMobile", () => {
  it("accepts common Iranian formats", () => {
    expect(normalizeIranMobile("09123456789")).toBe("09123456789");
    expect(normalizeIranMobile("+989123456789")).toBe("09123456789");
    expect(normalizeIranMobile("00989123456789")).toBe("09123456789");
    expect(normalizeIranMobile("989123456789")).toBe("09123456789");
    expect(normalizeIranMobile("9123456789")).toBe("09123456789");
    expect(normalizeIranMobile("0912 345-6789")).toBe("09123456789");
  });
  it("converts Persian and Arabic digits", () => {
    expect(normalizeIranMobile("۰۹۱۲۳۴۵۶۷۸۹")).toBe("09123456789");
    expect(normalizeIranMobile("٠٩١٢٣٤٥٦٧٨٩")).toBe("09123456789");
  });
  it("rejects invalid numbers", () => {
    expect(normalizeIranMobile("0812345678")).toBeNull();
    expect(normalizeIranMobile("021123456")).toBeNull();
    expect(normalizeIranMobile("")).toBeNull();
  });
});

describe("formatters", () => {
  it("formats card number and toman with Persian digits", () => {
    expect(formatCardNumber("6037991234567890", false)).toBe("6037-9912-3456-7890");
    expect(toPersianDigits(123)).toBe("۱۲۳");
    expect(formatToman(250000)).toBe("۲۵۰٬۰۰۰ تومان");
  });
});

describe("isolate", () => {
  it("wraps a Latin run in FSI/PDI so Persian punctuation stays on the correct side", () => {
    expect(isolate("PKFNDU")).toBe("⁨PKFNDU⁩");
  });

  it("is what makes a booking code safe inside a Persian sentence", () => {
    // The bot sends exactly this shape. Without the isolate, the colon renders on the wrong
    // side of the code — the string the customer keeps and re-reads.
    const msg = `کد رزرو: ${isolate("AB12CD")}`;
    expect(msg.startsWith("کد رزرو: ⁨")).toBe(true);
    expect(msg.endsWith("⁩")).toBe(true);
  });

  it("leaves the payload untouched, so a code is never altered in transit", () => {
    const code = "ZZ99QQ";
    expect(isolate(code).replace(/[⁨⁩]/g, "")).toBe(code);
  });
});
