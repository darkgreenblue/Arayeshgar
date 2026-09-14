/**
 * `node bots/bootstrap-tenants.js` — creates any committed bespoke tenant that is not yet on
 * this server's database.
 *
 * `tenants/*.json` in the repo root holds real, sold-or-being-pitched builds (Reza Hosseini's
 * is the first) in the exact shape `pnpm tenant:create` already validates and accepts — the
 * same `onboardingSchema` the wizard uses. Without this, a tenant built and committed in a PR
 * only ever exists in whoever's local database created it; the next deploy would ship the
 * photos under `apps/web/public/tenants/<slug>/` (part of the web bundle already) but never
 * the tenant row that makes the site resolve to anything.
 *
 * Idempotent by slug via `slugAvailable`, so this runs on every deploy exactly like
 * `bootstrap-demo` and only ever does work the first time a given tenant file lands on `main`.
 * One tenant's bad JSON is logged and skipped rather than failing the rest — a typo in a
 * customer file two weeks from now should not block every other tenant's deploy.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createTenant, logger, onboardingSchema, slugAvailable } from "@arayeshgar/core";
import { createDb } from "@arayeshgar/db";

async function main() {
  const dir = process.argv[2] ?? "tenants";
  const db = createDb();

  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    logger.info({ dir }, "no tenants directory shipped — nothing to bootstrap");
    return;
  }
  if (files.length === 0) {
    logger.info({ dir }, "tenants directory is empty");
    return;
  }

  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const raw = JSON.parse(await readFile(full, "utf8")) as unknown;
      const parsed = onboardingSchema.safeParse(raw);
      if (!parsed.success) {
        logger.error(
          { file, issues: parsed.error.issues.map((i) => i.message) },
          "tenant file failed validation — skipped",
        );
        continue;
      }
      if (!(await slugAvailable(db, parsed.data.slug))) {
        logger.info({ file, slug: parsed.data.slug }, "tenant already exists — not recreated");
        continue;
      }
      const { tenant } = await createTenant(db, parsed.data);
      logger.info({ file, slug: tenant.slug, tenantId: tenant.id }, "tenant created from file");
    } catch (err) {
      logger.error({ file, err: String(err) }, "failed to bootstrap tenant — skipped");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err: String(err) }, "bootstrap-tenants failed");
    process.exit(1);
  });
