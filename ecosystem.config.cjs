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
      max_memory_restart: "500M",
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
      max_memory_restart: "400M",
      autorestart: true,
      // The worker drains the outbox every 30s, so a crash loop would hammer Telegram.
      restart_delay: 5000,
    },
  ],
};
