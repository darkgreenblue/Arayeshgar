import { defineConfig, devices } from "@playwright/test";

/**
 * The golden path runs against a real build on a real browser. The web server is started by
 * Playwright; the SQLite file must already be migrated (CI does this before the e2e job).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"]] : [["list"]],
  use: {
    baseURL: `http://demo-e2e.localhost:${PORT}`,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    ...devices["Pixel 7"], // mobile-first product: test the way customers actually book
    // Use the image's preinstalled Chromium when present (CI containers ship one that may not
    // match this Playwright release); otherwise fall back to Playwright's own download.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    cwd: "../apps/web",
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "data/e2e.db",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
      BASE_DOMAIN: "localhost",
      UPLOADS_DIR: process.env.UPLOADS_DIR ?? "./data/e2e-uploads",
      NODE_ENV: "production",
      NEXT_NO_STANDALONE: "1",
    },
  },
});
