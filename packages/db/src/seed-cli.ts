/**
 * `pnpm db:seed` — the only thing that should ever seed by itself.
 *
 * Split out for the same reason as `migrate-cli.ts`: the old self-executing
 * `import.meta.url.endsWith(basename(argv[1]))` check inside `seed.ts` compares basenames,
 * so in any bundle whose entry is also `index.js` it would have been true — and seeding a
 * live database as a side effect of importing a module is not a mistake you get to make
 * twice. A module everything can import now has no side effects.
 */
import { seed } from "./seed";

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] failed", err);
    process.exit(1);
  });
