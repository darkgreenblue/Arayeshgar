import { describe, expect, it } from "vitest";
import { webhookPath, webhookUrl } from "../src/platform/webhook";
import { apiRootFor, CAPABILITIES } from "../src/platform/capabilities";

process.env.DATABASE_URL ??= "postgres://x/y";
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-test";

describe("webhook addressing", () => {
  const tenant = { id: "11111111-2222-3333-4444-555555555555", webhookSecret: "s3cr3t" };
  it("encodes platform, tenant and secret in the path", () => {
    expect(webhookPath(tenant, "telegram")).toBe(
      "/hooks/telegram/11111111-2222-3333-4444-555555555555/s3cr3t",
    );
    expect(webhookPath(tenant, "bale")).toBe(
      "/hooks/bale/11111111-2222-3333-4444-555555555555/s3cr3t",
    );
  });
  it("builds an absolute URL from BOTS_PUBLIC_URL without double slashes", () => {
    process.env.BOTS_PUBLIC_URL = "https://bots.example.ir/";
    expect(webhookUrl(tenant, "telegram")).toBe(
      "https://bots.example.ir/hooks/telegram/11111111-2222-3333-4444-555555555555/s3cr3t",
    );
  });
});

describe("platform differences", () => {
  it("routes each platform to its own API root", () => {
    process.env.TELEGRAM_API_ROOT = "https://api.telegram.org";
    process.env.BALE_API_ROOT = "https://tapi.bale.ai";
    expect(apiRootFor("telegram")).toBe("https://api.telegram.org");
    expect(apiRootFor("bale")).toBe("https://tapi.bale.ai");
  });
  it("keeps Bale's capability map conservative", () => {
    expect(CAPABILITIES.bale.inlineMode).toBe(false);
    expect(CAPABILITIES.telegram.inlineMode).toBe(true);
    expect(CAPABILITIES.bale.maxCallbackData).toBe(64);
  });
});
