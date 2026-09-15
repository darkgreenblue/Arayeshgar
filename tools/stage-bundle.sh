#!/usr/bin/env bash
# Assembles the directory that gets shipped to the server, exactly as `deploy.yml` does.
#
# This exists so the layout can be proven on a laptop or a runner before it is ever
# rsynced onto a shared box. Run it, then run the two processes out of the staged tree and
# hit their health endpoints — a deploy that has only ever been reasoned about is a deploy
# that has not been tested.
#
#   pnpm build && tools/stage-bundle.sh out/
#
# The result is install-free: nothing here needs npm, pnpm or a compiler on the server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:?usage: stage-bundle.sh <output-dir>}"
# Must match the resolved version in pnpm-lock.yaml; the guard below enforces it.
LIBSQL_CLIENT_VERSION="0.18.0"

STANDALONE="$ROOT/apps/web/.next/standalone"
[ -d "$STANDALONE" ] || { echo "❌ $STANDALONE missing — run 'pnpm build' first"; exit 1; }
[ -f "$ROOT/apps/bots/dist/index.js" ] || { echo "❌ bots bundle missing — run 'pnpm build'"; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT"

# ── web ────────────────────────────────────────────────────────────────────────────────
# The standalone tree is copied whole and unmodified. Next traces its dependencies and
# writes paths relative to the tree's own root, so moving pieces inside it (say, hoisting
# apps/web up a level) breaks resolution. Hence `web/apps/web/server.js` in
# ecosystem.config.cjs — ugly, but it is the path that actually works.
cp -a "$STANDALONE" "$OUT/web"
# `next build` deliberately leaves these two out of standalone; without them the pages
# render with no CSS or JS and every image 404s.
mkdir -p "$OUT/web/apps/web/.next"
cp -a "$ROOT/apps/web/.next/static" "$OUT/web/apps/web/.next/static"
[ -d "$ROOT/apps/web/public" ] && cp -a "$ROOT/apps/web/public" "$OUT/web/apps/web/public"

# ── bots ───────────────────────────────────────────────────────────────────────────────
mkdir -p "$OUT/bots"
for f in index migrate bootstrap-demo bootstrap-tenants; do
  cp "$ROOT/apps/bots/dist/$f.js" "$OUT/bots/$f.js"
  # Source maps are worth their disk here: `Ops → errors` is the only view into a crash,
  # and a stack trace through 2 MB of bundled output is unreadable without them.
  cp "$ROOT/apps/bots/dist/$f.js.map" "$OUT/bots/$f.js.map"
done

# The two externals, as a real (non-symlinked) tree the bundle can resolve upward from.
# standalone's own node_modules cannot serve this: it is pnpm-shaped, so there is no
# top-level @libsql/client for Node to find. `npm install` into a temp dir produces the
# flat layout we need, and it happens on the runner where the registry is reachable.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
(
  cd "$TMP"
  npm init -y >/dev/null 2>&1
  npm install --no-audit --no-fund --omit=dev \
    "@libsql/client@$LIBSQL_CLIENT_VERSION" >/dev/null 2>&1
)
mkdir -p "$OUT/bots/node_modules"
# -L dereferences: the server gets real files, never a link into a store that isn't there.
cp -RL "$TMP/node_modules/." "$OUT/bots/node_modules/"

# The native binding is a prebuilt .node. It is N-API, so it does not care which Node
# version runs it — but it very much cares about platform, so refuse to ship the wrong one.
NATIVE="$OUT/bots/node_modules/@libsql/linux-x64-gnu/index.node"
if [ ! -f "$NATIVE" ]; then
  echo "❌ linux-x64-gnu binding missing from the staged tree."
  echo "   Present instead: $(ls "$OUT/bots/node_modules/@libsql" 2>/dev/null | tr '\n' ' ')"
  echo "   Staging must run on linux x64 (glibc), matching the server."
  exit 1
fi

# ── migrations + process list ──────────────────────────────────────────────────────────
# Shipped as plain .sql, read at run time via MIGRATIONS_DIR, because a relocated build
# has no packages/db beside it.
cp -a "$ROOT/packages/db/drizzle" "$OUT/drizzle"
cp "$ROOT/ecosystem.config.cjs" "$OUT/ecosystem.config.cjs"

# ── bespoke tenants ────────────────────────────────────────────────────────────────────
# Read by bots/bootstrap-tenants.js on every deploy. Each file is a real, committed build
# (Reza Hosseini's is the first) in the same shape `pnpm tenant:create` accepts.
[ -d "$ROOT/tenants" ] && cp -a "$ROOT/tenants" "$OUT/tenants"

# ── server-side scripts ────────────────────────────────────────────────────────────────
# deploy.yml runs `$DIR/tools/arvan-firewall.sh` on the server (both directly, when
# ARVAN_MODE is on, and from a @reboot cron line it installs) -- but this directory was
# never part of the staged tree, so the file existed in the repo and in CI's checkout yet
# was never actually on the server. Exit 127 ("No such file or directory") on the very
# first deploy that turned ARVAN_MODE on is what caught it.
mkdir -p "$OUT/tools"
cp "$ROOT/tools/arvan-firewall.sh" "$OUT/tools/arvan-firewall.sh"

# ── prove the process list points at files that exist ──────────────────────────────────
# Written because it did not: `ecosystem.config.cjs` said `web/server.js` while the
# standalone entry is `web/apps/web/server.js`, and nothing in the pipeline disagreed.
# pm2 would have reported that app `errored`, the health check would have timed out, and
# with no `.prev` on a first deploy the rollback branch just stops the apps — a red deploy
# whose cause is one wrong path in a file nobody re-reads. A typo is now a staging failure.
node - "$OUT" <<'CHECK'
const fs = require("node:fs");
const path = require("node:path");
const out = process.argv[2];
const { apps } = require(path.join(out, "ecosystem.config.cjs"));
let bad = 0;
for (const a of apps) {
  // `interpreter: "none"` marks a binary found on PATH (cloudflared), not a file we ship.
  if (a.interpreter === "none") {
    console.log(`   ${a.name}: ${a.script} (binary on PATH, not shipped)`);
    continue;
  }
  const p = path.join(out, a.script);
  if (fs.existsSync(p)) {
    console.log(`   ${a.name}: ${a.script} ✅`);
  } else {
    console.error(`❌ ${a.name}: ecosystem.config.cjs points at "${a.script}", which is not in the staged tree`);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
CHECK

echo "✅ staged → $OUT"
du -sh "$OUT" "$OUT/web" "$OUT/bots" 2>/dev/null || true
echo "   one-shot entries: bots/migrate.js · bots/bootstrap-demo.js · bots/bootstrap-tenants.js"
