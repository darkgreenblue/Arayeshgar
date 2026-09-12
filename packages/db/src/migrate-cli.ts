/**
 * `pnpm db:migrate` — the only thing that should ever apply migrations by itself.
 *
 * This lives in its own file rather than as an `import.meta.url === argv[1]` block inside
 * `migrate.ts`, because that check is not safe under bundling: esbuild rewrites both sides to
 * the bundle's own path, so the block fired inside the bots service, ran migrations against
 * a folder that no longer existed beside it, and exited the process. Splitting the entry
 * point out removes the whole class of bug — a module that everything imports now has no
 * side effects at all.
 */
import { runMigrations } from "./migrate";

runMigrations()
  .then(() => {
    console.error("[db] migrations applied");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[db] migration failed", err);
    process.exit(1);
  });
