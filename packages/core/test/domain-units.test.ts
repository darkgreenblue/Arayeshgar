import { describe, expect, it } from "vitest";
import { computeDeposit } from "../src/payments/deposit";
import { can, visibleStaffIds } from "../src/authz/permissions";
import { generateBookingCode, normalizeBookingCode } from "../src/booking/codes";
import { canTransition } from "../src/booking/status";
import { renderNotification } from "../src/notifications/render";
import { effectiveDeposit, payToCard } from "../src/tenant/config";
import { backoffSeconds } from "../src/notifications/outbox";

describe("deposit", () => {
  it("fixed, percent, rounding and caps", () => {
    expect(computeDeposit({ enabled: true, mode: "fixed", amount: 100000 }, 250000)).toBe(100000);
    expect(computeDeposit({ enabled: true, mode: "percent", amount: 30 }, 250000)).toBe(75000);
    expect(computeDeposit({ enabled: true, mode: "percent", amount: 33 }, 250000)).toBe(83000); // 82,500 -> nearest 1,000
    expect(computeDeposit({ enabled: true, mode: "fixed", amount: 900000 }, 250000)).toBe(250000);
    expect(computeDeposit({ enabled: false, mode: "fixed", amount: 100000 }, 250000)).toBe(0);
  });
  it("feature flag is the master switch and staff card wins in salon_independent", () => {
    const tenant = {
      mode: "salon_independent" as const,
      features: { deposit: false },
      depositSettings: {
        enabled: true,
        mode: "fixed" as const,
        amount: 1000,
        cardNumber: "1111222233334444",
        cardHolder: "سالن",
      },
    };
    expect(effectiveDeposit(tenant).enabled).toBe(false);
    expect(
      payToCard(tenant, {
        depositSettings: { cardNumber: "5555666677778888", cardHolder: "آرایشگر" },
      }).cardNumber,
    ).toBe("5555666677778888");
    expect(
      payToCard(
        { ...tenant, mode: "salon_central" },
        { depositSettings: { cardNumber: "5555666677778888" } },
      ).cardNumber,
    ).toBe("1111222233334444");
  });
});

describe("authz matrix", () => {
  const tenant = { id: "t1", mode: "salon_independent" as const };
  const base = { tenantId: "t1", isActive: true };
  it("owner can do everything except tenant-level; manager cannot touch branding", () => {
    expect(can({ ...base, role: "owner", staffId: null }, "manage_branding", { tenant })).toBe(
      true,
    );
    expect(can({ ...base, role: "owner", staffId: null }, "manage_tenant", { tenant })).toBe(false);
    expect(can({ ...base, role: "manager", staffId: null }, "manage_branding", { tenant })).toBe(
      false,
    );
    expect(
      can({ ...base, role: "manager", staffId: null }, "review_receipt", { tenant, staffId: "s9" }),
    ).toBe(true);
  });
  it("independent staff manage only their own calendar", () => {
    const s = { ...base, role: "staff" as const, staffId: "s1" };
    expect(can(s, "manage_booking", { tenant, staffId: "s1" })).toBe(true);
    expect(can(s, "manage_booking", { tenant, staffId: "s2" })).toBe(false);
    expect(can(s, "manage_staff", { tenant, staffId: "s1" })).toBe(false);
    expect(visibleStaffIds(s, tenant)).toEqual(["s1"]);
    expect(visibleStaffIds({ ...base, role: "owner", staffId: null }, tenant)).toBeNull();
  });
  it("staff in central salons are read-only", () => {
    const central = { id: "t1", mode: "salon_central" as const };
    const s = { ...base, role: "staff" as const, staffId: "s1" };
    expect(can(s, "view_bookings", { tenant: central, staffId: "s1" })).toBe(true);
    expect(can(s, "manage_booking", { tenant: central, staffId: "s1" })).toBe(false);
  });
  it("cross-tenant and inactive users are denied; platform admin allowed", () => {
    expect(
      can({ ...base, tenantId: "other", role: "owner", staffId: null }, "view_bookings", {
        tenant,
      }),
    ).toBe(false);
    expect(
      can({ ...base, isActive: false, role: "owner", staffId: null }, "view_bookings", { tenant }),
    ).toBe(false);
    expect(
      can(
        { tenantId: null, isActive: true, role: "platform_admin", staffId: null },
        "manage_tenant",
        { tenant },
      ),
    ).toBe(true);
  });
});

describe("codes & status", () => {
  it("codes avoid ambiguous characters and normalize input", () => {
    for (let i = 0; i < 200; i++)
      expect(generateBookingCode()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(normalizeBookingCode(" ab-c2 3x ")).toBe("ABC23X");
  });
  it("state machine", () => {
    expect(canTransition("pending_payment", "receipt_submitted")).toBe(true);
    expect(canTransition("receipt_submitted", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "pending_payment")).toBe(false);
    expect(canTransition("expired", "confirmed")).toBe(false);
  });
  it("backoff grows and caps", () => {
    expect(backoffSeconds(1)).toBe(30);
    expect(backoffSeconds(3)).toBe(120);
    expect(backoffSeconds(20)).toBe(6 * 3600);
  });
});

describe("render", () => {
  const p = {
    bookingId: "b1",
    code: "ABC234",
    status: "pending_payment",
    startAt: "2026-09-05T11:00:00Z",
    endAt: "2026-09-05T11:30:00Z",
    serviceName: "اصلاح مو",
    staffName: "علی",
    customerName: "رضا",
    customerPhone: "09123456789",
    price: 250000,
    depositAmount: 100000,
    payTo: { cardNumber: "6037991234567890", cardHolder: "علی رضایی", bankName: "ملی" },
    paymentDeadline: "2026-09-05T10:00:00Z",
    siteUrl: "https://demo.example.ir",
    audience: "customer" as const,
  };
  it("customer payment instructions include card, amount, deadline and receipt button", () => {
    const m = renderNotification("booking_created", p);
    expect(m.text).toContain("۶۰۳۷-۹۹۱۲-۳۴۵۶-۷۸۹۰");
    expect(m.text).toContain("۱۰۰٬۰۰۰ تومان");
    expect(m.text).toContain("مهلت");
    expect(m.buttons[0]?.[0]?.data).toBe("bk:receipt:b1");
  });
  it("admin receipt message carries approve/reject and the photo", () => {
    const m = renderNotification("receipt_submitted", {
      ...p,
      audience: "admin",
      receiptPath: "t/x.jpg",
    });
    expect(m.photoPath).toBe("t/x.jpg");
    expect(m.buttons[0]?.map((b) => b.data)).toEqual(["bk:approve:b1", "bk:reject:b1"]);
    expect(m.text).toContain("۰۹۱۲ ۳۴۵ ۶۷۸۹");
  });
});
