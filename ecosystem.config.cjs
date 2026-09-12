/**
 * pm2 process list for the shared server.
 *
 * Paths are relative to the deploy directory (`~/arayeshgar`), which is what lands there:
 * `web/` is the Next.js standalone output and `bots/` is the esbuild bundle, both built on
 * the runner. Nothing is installed on the server.
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
 */
module.exports = {
  apps: [
    {
      name: "arayeshgar-web",
      script: "web/server.js",
      cwd: ".",
      env: { PORT: "8800", HOSTNAME: "127.0.0.1" },
      // One process: SQLite has a single writer, so a second instance would only queue
      // behind the first while doubling the memory.
      instances: 1,
      exec_mode: "fork",
      // Measured 131 MB idle and after page loads. 240M catches a leak while leaving
      // room for an SSR spike.
      max_memory_restart: "240M",
      autorestart: true,
    },
    {
      name: "arayeshgar-bots",
      script: "bots/index.js",
      cwd: ".",
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
    },
  ],
};
