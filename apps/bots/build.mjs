/**
 * Bundles the bots service into one file so the server never runs a package install.
 *
 * PLATFORM.md's deploy pattern runs `npm ci` on the server, which does not work here for
 * two reasons: this is a pnpm workspace (and pnpm is not on the shared server), and rule 8
 * says the server may not be able to reach the registry at all. Bundling on the runner
 * sidesteps both — what lands on the server is one .js file.
 *
 * **What deliberately stays external, and only that.** `libsql` loads a compiled `.node`
 * binary, which cannot be bundled; `@libsql/client` is left out with it so both halves keep
 * agreeing about the same instance. Everything else goes in — including pino, which is pure
 * JS here because the logger writes straight to stdout and configures no transport (a
 * transport would pull in worker threads and could not be bundled).
 *
 * The two externals have to reach the server as real files next to the bundle. Which
 * prebuilt binary is the right one depends on the server's platform and Node version, and
 * that is exactly what `Ops → status` is for — so `deploy.yml` pins it, not this script.
 * They are declared as direct dependencies of this package for the same reason: Node
 * resolves them from `dist/` upwards, so being a transitive dependency of `@arayeshgar/db`
 * is not enough. Verified the hard way — the first bundle built fine and died on startup.
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

/** Only what cannot be bundled: the native SQLite binding and its client. */
const EXTERNAL = ["@libsql/client", "libsql"];

const result = await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  // The server's Node version is unknown until `Ops → status` runs. node20 is the floor
  // Next.js 16 already requires, so it cannot be lower than this.
  target: "node20",
  format: "esm",
  sourcemap: true,
  minify: false, // a readable stack trace is worth more than the bytes on one server
  external: EXTERNAL,
  // ESM output plus a CJS dependency means `require` is not defined; this gives it one.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
console.error(`bundled ${pkg.name} → dist/index.js (${(bytes / 1024).toFixed(0)} KB)`);
console.error(`external (must be shipped as real files): ${EXTERNAL.join(", ")}`);
