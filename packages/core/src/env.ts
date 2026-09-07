import { z } from "zod";
import { DEFAULT_DB_PATH } from "@arayeshgar/db";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BASE_DOMAIN: z.string().default("localhost"),
  PUBLIC_URL_SCHEME: z.enum(["http", "https"]).default("http"),
  // A path to the SQLite file. Defaults to what §9ب of PLATFORM.md expects, so a
  // fresh checkout, a test run and the server all agree without anyone setting it.
  DATABASE_URL: z.string().min(1).default(DEFAULT_DB_PATH),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  UPLOADS_DIR: z.string().default("./data/uploads"),
  LOG_LEVEL: z.string().default("info"),
  TELEGRAM_API_ROOT: z.string().url().default("https://api.telegram.org"),
  BALE_API_ROOT: z.string().url().default("https://tapi.bale.ai"),
  BOTS_PUBLIC_URL: z.string().url().default("http://localhost:3001"),
  BOTS_PORT: z.coerce.number().default(3001),
  // Polling by default (§11): it needs no public URL, so the demo runs from a laptop.
  // Switch to webhook once a stable HTTPS address exists.
  BOT_TRANSPORT: z.enum(["polling", "webhook"]).default("polling"),
  WORKER_INTERVAL_SEC: z.coerce.number().default(30),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parses and caches process.env. Throws a readable error listing every missing variable. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Public URL of a tenant's site, e.g. https://ali.example.ir */
export function tenantPublicUrl(
  env: Env,
  tenant: { slug: string; customDomain: string | null },
): string {
  const host = tenant.customDomain ?? `${tenant.slug}.${env.BASE_DOMAIN}`;
  const port = env.NODE_ENV === "development" && env.BASE_DOMAIN === "localhost" ? ":3000" : "";
  return `${env.PUBLIC_URL_SCHEME}://${host}${port}`;
}
