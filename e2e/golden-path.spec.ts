/**
 * The one journey that must never break: a customer books on the phone, is told to pay a deposit,
 * uploads the receipt, the barber approves it in the panel, and the slot is gone from the site.
 */
import { test, expect } from "@playwright/test";
import { dropTenant, JPEG, resetTenant, ADMIN } from "./fixtures";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const site = `http://demo-e2e.localhost:${PORT}`;

test.beforeAll(async () => {
  await resetTenant();
});
test.afterAll(async () => {
  await dropTenant();
});

test("customer books with a deposit, barber approves, slot disappears", async ({ page }) => {
  // --- the site is a business card first
  await page.goto(site);
  await expect(page.getByRole("heading", { name: "آرایشگاه تست سرتاسری" })).toBeVisible();
  await expect(page.getByText("اصلاح حرفه‌ای، وقت دقیق")).toBeVisible();
  await expect(page.getByRole("link", { name: "رزرو وقت" }).first()).toBeVisible();

  // --- four-step booking
  await page.getByRole("link", { name: "رزرو وقت" }).first().click();
  await expect(page.getByRole("heading", { name: "چه خدمتی می‌خواهید؟" })).toBeVisible();
  await page.getByRole("button", { name: /اصلاح مو/ }).click();

  await expect(page.getByRole("heading", { name: "کدام روز؟" })).toBeVisible();
  const days = page.locator("button", {
    hasText: /شنبه|یکشنبه|دوشنبه|سه‌شنبه|چهارشنبه|پنجشنبه|جمعه/,
  });
  await days.nth(1).click(); // tomorrow-ish, safely outside the minimum lead time

  await expect(page.getByRole("heading", { name: "کدام ساعت؟" })).toBeVisible();
  const slotButton = page.locator("button.fa-nums").first();
  const chosenTime = (await slotButton.textContent())?.trim() ?? "";
  expect(chosenTime).toMatch(/[۰-۹]{2}:[۰-۹]{2}/);
  await slotButton.click();

  await expect(page.getByRole("heading", { name: "اطلاعات شما" })).toBeVisible();
  await page.getByPlaceholder("مثلاً رضا احمدی").fill("رضا تستی");
  await page.getByPlaceholder("0912 345 6789").fill("09121234567");
  await page.getByRole("button", { name: "ثبت رزرو" }).click();

  // --- deposit instructions
  await page.waitForURL(/\/b\/[A-Z0-9]{6}/);
  const code = page.url().split("/b/")[1]!.split("?")[0]!;
  await expect(page.getByText("وقت شما موقتاً رزرو شد")).toBeVisible();
  await expect(page.getByText("۶۰۳۷-۹۹۱۲-۳۴۵۶-۷۸۹۰")).toBeVisible();
  await expect(page.getByText("۱۰۰٬۰۰۰ تومان").first()).toBeVisible();

  // --- receipt upload
  await page.setInputFiles('input[type="file"]', {
    name: "receipt.jpg",
    mimeType: "image/jpeg",
    buffer: JPEG,
  });
  await page.getByRole("button", { name: "رسید را فرستادم" }).click();
  await expect(page.getByText("رسید شما دریافت شد")).toBeVisible();

  // --- the slot is already held: a second customer cannot take it
  const other = await page.context().newPage();
  await other.goto(`${site}/book`);
  await other.getByRole("button", { name: /اصلاح مو/ }).click();
  await other
    .locator("button", { hasText: /شنبه|یکشنبه|دوشنبه|سه‌شنبه|چهارشنبه|پنجشنبه|جمعه/ })
    .nth(1)
    .click();
  await expect(other.getByRole("heading", { name: "کدام ساعت؟" })).toBeVisible();
  await expect(other.locator("button.fa-nums", { hasText: chosenTime })).toHaveCount(0);
  await other.close();

  // --- barber approves in the panel
  await page.goto(`${site}/admin/login`);
  await page.getByLabel("نام کاربری").fill(ADMIN.username);
  await page.getByLabel("رمز عبور").fill(ADMIN.password);
  await page.getByRole("button", { name: "ورود" }).click();
  await page.waitForURL(/\/admin$/);

  await page.goto(`${site}/admin/receipts`);
  await expect(page.getByText("رضا تستی")).toBeVisible();
  await expect(page.locator('img[alt="رسید"]')).toBeVisible();
  await page.getByRole("button", { name: "تأیید رسید" }).click();
  await expect(page.getByText("همه‌چیز بررسی شده است")).toBeVisible();

  // --- customer sees the confirmation
  await page.goto(`${site}/b/${code}`);
  await expect(page.getByText("تأیید شده")).toBeVisible();

  // --- and it shows in today's/upcoming list for the barber
  await page.goto(`${site}/admin/bookings`);
  await expect(page.getByText("رضا تستی")).toBeVisible();
});
