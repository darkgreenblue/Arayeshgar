/**
 * pm2 process list for the shared server.
 *
 * Script paths are relative to the deploy directory (`~/arayeshgar`), which is what lands
 * there: `web/` is the Next.js standalone output and `bots/` is the esbuild bundle, both
 * built on the runner. Nothing is installed on the server. `cwd` and the log paths are
 * absolute, derived from `__dirname` — see the note above the constants for why.
 *
 * Two rules from PLATFORM.md are load-bearing here and neither is cosmetic:
 *
 *  - **App names are prefixed.** `arayeshgar-web` / `arayeshgar-bots` share a pm2 daemon with
 *    other people's revenue-earning apps. A bare `web` would collide, and a pm2 command
 *    aimed at a colliding name is how you restart somebody else's product by accident.
 *  - **The web app binds `127.0.0.1` only.** No port is ever exposed to the internet; the
 *    Cloudflare tunnel reaches in. `HOSTNAME` is how the Next standalone server is told —
 *    without it, it binds `0.0.0.0` and the box is listening publicly on 8800.
 *
 * The port is 8800 because 8787 is the shared dashboard's.
 *
 * **The memory limits come from measurement, not from round numbers.** Two measurements,
 * and both mattered:
 *
 *  - The box (`Ops → status`): 961 MB total, 346 MB available, 412 MB already held by eight
 *    other apps, 375 MB of swap already in use.
 *  - These two processes, run out of the staged deploy tree: web 131 MB RSS, bots 108-125 MB,
 *    about 253 MB for the pair after serving a few pages.
 *  - **And now from the real server, after the first deploy:** web 108.8 MB, bots 95.1 MB,
 *    tunnel 37.2 MB — 241 MB for all three, comfortably under the local estimate. So the
 *    limits below are conservative rather than tight, which is the right side to be on.
 *
 * The first version of this file guessed 500M and 400M, which on this box is not a limit at
 * all — it would never fire before the kernel's OOM killer, and the process the kernel picks
 * need not be ours. The second guess, 160M for bots, was *below* the bots process's own idle
 * RSS, which would have produced a restart loop. Hence: measure, then set.
 *
 * `--max-old-space-size` was tried and dropped: capping the V8 heap moved the pair from
 * 255 MB to 253 MB, because almost none of the RSS is heap — it is Node's own baseline plus
 * the 9.7 MB native libsql binding. Complexity for 2 MB is not worth it.
 *
 * Re-measure with `Ops → status` before raising either limit.
 *
 * **Log paths are explicit, and that is a bug fix, not tidiness.** pm2's default is
 * `~/.pm2/logs/<name>-out.log`, and the deploy, the health check and all three `Ops`
 * actions each hardcoded that guess. The first real deploy then captured no demo URL and
 * printed an empty tunnel error log — and with the path guessed, there was no way to tell
 * "cloudflared logged nothing" from "we read the wrong file". Naming the files here makes
 * one place authoritative for every reader.
 */
// **Absolute, derived from this file's own location.** A relative `out_file` is resolved
// against the pm2 *daemon's* cwd in some pm2 versions rather than the app's, which would
// scatter the logs into `$HOME/data/logs` and reproduce the exact bug this is fixing — a
// path nobody can confirm from outside. `__dirname` is the deploy directory by
// construction, since `tools/stage-bundle.sh` puts this file at the bundle root. Same
// reasoning for `cwd`: it was `"."`, which only worked because the deploy happens to `cd`
// first.
// Joined with a template rather than `path.join`: this file is loaded by pm2 on a Linux
// server, `__dirname` never carries a trailing slash, and it keeps the config free of
// imports.
const HERE = __dirname;
const LOGS = `${HERE}/data/logs`;

module.exports = {
  apps: [
    {
      name: "arayeshgar-web",
      // **Not `web/server.js`.** `next build --output standalone` on a monorepo writes a
      // tree that mirrors the workspace, so the entry sits at `apps/web/server.js` *inside*
      // it, next to a `node_modules` full of traced deps whose paths are relative to that
      // tree's own root. `tools/stage-bundle.sh` therefore copies it whole and unmodified —
      // hoisting the entry up a level would break every one of those resolutions. Ugly
      // path, but it is the one that exists: verified against the real build output.
      script: "web/apps/web/server.js",
      cwd: HERE,
      env: { PORT: "8800", HOSTNAME: "127.0.0.1" },
      // One process: SQLite has a single writer, so a second instance would only queue
      // behind the first while doubling the memory.
      instances: 1,
      exec_mode: "fork",
      // Measured 131 MB idle and after page loads. 240M catches a leak while leaving
      // room for an SSR spike.
      max_memory_restart: "240M",
      autorestart: true,
      out_file: `${LOGS}/web-out.log`,
      error_file: `${LOGS}/web-error.log`,
    },
    {
      name: "arayeshgar-bots",
      script: "bots/index.js",
      cwd: HERE,
      // Long polling means exactly one process may hold getUpdates per bot token: a second
      // one would make Telegram hand each update to whichever asked first, so half the
      // messages would be answered by a process the customer is not talking to.
      instances: 1,
      exec_mode: "fork",
      // Measured 108-125 MB idle — so 160M, which an earlier version of this file used,
      // sat below the floor and would have restart-looped.
      max_memory_restart: "200M",
      autorestart: true,
      // The worker drains the outbox every 30s, so a crash loop would hammer Telegram.
      restart_delay: 5000,
      out_file: `${LOGS}/bots-out.log`,
      error_file: `${LOGS}/bots-error.log`,
    },
    {
      // The only way in from the internet. Nothing here opens a port: cloudflared makes an
      // outbound connection to Cloudflare's edge and forwards requests back to loopback.
      //
      // **This is a quick tunnel, not a named one, and that is a deliberate downgrade.**
      // A named tunnel needs a domain sitting in a Cloudflare zone, and the free-domain
      // route fell over: DigitalPlat now asks for registry and billing details the owner
      // does not have. A quick tunnel needs no domain, no Cloudflare account, and no card —
      // which also sidesteps signing up to Cloudflare from Iran. The cost is that Cloudflare
      // assigns the `*.trycloudflare.com` hostname during startup, so **the URL changes
      // every time this process restarts**; the deploy captures it into
      // `data/demo-url.txt` and `Ops → status` prints it, so the current link is always
      // findable rather than guessed. Cloudflare caps quick tunnels at 200 concurrent
      // requests and documents them as test-only, which is fine for showing one barber a
      // demo and is not fine for a paying customer — that is when a `.ir` domain and a
      // named tunnel replace this.
      name: "arayeshgar-tunnel",
      script: "cloudflared",
      // `--no-autoupdate`: a self-update would restart the process, and every restart of
      // this process silently changes the demo URL.
      args: "tunnel --no-autoupdate --url http://127.0.0.1:8800",
      cwd: HERE,
      instances: 1,
      exec_mode: "fork",
      interpreter: "none", // a Go binary, not a Node script
      // Measured ~30 MB in practice; 120M is a leak guard, not an allocation.
      max_memory_restart: "120M",
      autorestart: true,
      restart_delay: 5000,
      // The demo URL exists *only* in this file — Cloudflare has no API to ask for it
      // later. So this is the one log path the product genuinely depends on.
      out_file: `${LOGS}/tunnel-out.log`,
      error_file: `${LOGS}/tunnel-error.log`,
    },
  ],
};
