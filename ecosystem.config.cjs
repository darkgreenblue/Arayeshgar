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

// **`merge_logs` is why the demo URL went missing twice.** This server's pm2 appends the
// process id to whatever filename you give it, so `tunnel-out.log` is actually written as
// `tunnel-out-14.log` — and the id changes every time the app is recreated. `pm2 describe`
// on the failed deploy said so outright:
//
//     out log path │ /home/ubuntu/arayeshgar/data/logs/tunnel-out-14.log
//
// `merge_logs: true` turns that suffix off (its one documented job). Readers *also* glob
// `<name>-out*.log`, so a pm2 that suffixes anyway still gets found — this is the one path
// the product depends on, and two independent ways of being right is proportionate.
const logs = (name) => ({
  out_file: `${LOGS}/${name}-out.log`,
  error_file: `${LOGS}/${name}-error.log`,
  merge_logs: true,
});

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
      // **`HOSTNAME` is normally `127.0.0.1` — the only exception is ArvanCloud origin
      // mode.** When `ARVAN_MODE=true` (from the `ARAYESHGAR_ARVAN_MODE` secret, written
      // into `.env` under the shorter name to match `BASE_DOMAIN`/`DEMO_DOMAIN`),
      // ArvanCloud's CDN edge needs to reach
      // this port directly (no outbound-only tunnel like Cloudflare's), so it binds every
      // interface instead. That alone would expose it to the whole internet; what actually
      // keeps it closed to everyone but ArvanCloud is `tools/arvan-firewall.sh`, called
      // from `deploy.yml` before this app (re)starts — see that script for why iptables
      // and not ufw. The health check independently verifies that firewall rule exists
      // before calling a deploy healthy, exactly like it independently verifies the
      // loopback bind in every other mode.
      env: { PORT: "8800", HOSTNAME: process.env.ARVAN_MODE === "true" ? "0.0.0.0" : "127.0.0.1" },
      // One process: SQLite has a single writer, so a second instance would only queue
      // behind the first while doubling the memory.
      instances: 1,
      exec_mode: "fork",
      // Measured 131 MB idle and after page loads. 240M catches a leak while leaving
      // room for an SSR spike.
      max_memory_restart: "240M",
      autorestart: true,
      ...logs("web"),
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
      ...logs("bots"),
    },
    {
      // The only way in from the internet. Nothing here opens a port: cloudflared makes an
      // outbound connection to Cloudflare's edge and forwards requests back to loopback.
      //
      // **Named tunnel when the owner's own domain is configured, quick tunnel otherwise.**
      // A named tunnel needs a domain sitting in a Cloudflare zone plus a tunnel token from
      // the Cloudflare dashboard (`CLOUDFLARE_TUNNEL_TOKEN`, per §4 PLATFORM.md) — once that
      // secret exists, `cloudflared` reads it from the environment (never a CLI arg: this
      // process's argv is visible to every user on the shared box via `ps`) and connects to
      // the tunnel that was named in the dashboard, whose public hostname was pointed at
      // `http://localhost:8800` there. That hostname is fixed by the owner, not assigned by
      // Cloudflare, so it survives restarts — unlike the fallback below.
      //
      // Without that secret, this falls back to a quick tunnel: no domain, no Cloudflare
      // account, no card needed. The cost is that Cloudflare assigns the
      // `*.trycloudflare.com` hostname during startup, so **the URL changes every time this
      // process restarts**; the deploy captures it into `data/demo-url.txt` and
      // `Ops → status` prints it, so the current link is always findable rather than
      // guessed. Cloudflare caps quick tunnels at 200 concurrent requests and documents them
      // as test-only, which is fine for showing one barber a demo and is not fine for a
      // paying customer.
      name: "arayeshgar-tunnel",
      script: "cloudflared",
      // `--no-autoupdate`: a self-update would restart the process, and every restart of
      // this quick-tunnel fallback silently changes the demo URL.
      args: process.env.CLOUDFLARE_TUNNEL_TOKEN
        ? "tunnel --no-autoupdate run"
        : "tunnel --no-autoupdate --url http://127.0.0.1:8800",
      env: process.env.CLOUDFLARE_TUNNEL_TOKEN
        ? { TUNNEL_TOKEN: process.env.CLOUDFLARE_TUNNEL_TOKEN }
        : {},
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
      ...logs("tunnel"),
    },
  ],
};
