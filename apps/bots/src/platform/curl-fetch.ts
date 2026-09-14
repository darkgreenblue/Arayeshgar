/**
 * A `fetch`-shaped function backed by a `curl` subprocess, instead of Node's own HTTPS stack.
 *
 * Why this exists, and why it is not a small thing to have added: on the shared production
 * server, every single call Node's own network stack made to `api.telegram.org` -- `fetch`,
 * `https.request`, with or without a keepAlive agent, GET or the exact POST grammY sends --
 * timed out after our own 15s limit, 100% of the time, across many fresh restarts, for hours.
 * In the exact same process, at the exact same moment, a `curl` *subprocess* to the exact same
 * URL succeeded in well under a second. That rules out the network, DNS, and the process's own
 * cgroup/environment (a subprocess inherits all of that identically) -- it isolates the fault to
 * Node's own HTTP client internals specifically, in this process, on this box. Nobody could
 * explain why; but curl reliably works and Node's own stack reliably does not, so the practical
 * fix is to stop asking Node to make the request.
 *
 * grammY's `ApiClient` accepts a `fetch` override in its client options for exactly this kind of
 * substitution. This file is that override. It only needs to support what grammY's own
 * `payload.js` ever actually builds: a JSON body (a plain string) or a pre-built multipart
 * body (a Node Readable stream, boundary already baked into the content-type header) -- never
 * a WHATWG `FormData` object, so no multipart re-encoding is needed here, just forwarding bytes.
 * The only thing grammY's own `call()` does with the resolved value is call `.json()` on it, so
 * that is the only method this needs to implement.
 */
import { spawn } from "node:child_process";
import type { Readable } from "node:stream";

type CurlFetchResponse = { json: () => Promise<unknown> };

async function readBody(body: unknown): Promise<Buffer | undefined> {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return Buffer.from(body);
  if (Buffer.isBuffer(body)) return body;
  // grammY's multipart payload is a Node Readable stream of pre-formatted bytes.
  const stream = body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Matches the subset of `RequestInit` that grammY's `ApiClient` actually sets. */
export type CurlFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
};

export async function curlFetch(
  url: string | URL,
  init: CurlFetchInit = {},
): Promise<CurlFetchResponse> {
  const bodyBuffer = await readBody(init.body);
  const args = ["-sS", "--max-time", "20"];
  if (init.method) args.push("-X", init.method);
  for (const [key, value] of Object.entries(init.headers ?? {})) {
    args.push("-H", `${key}: ${value}`);
  }
  if (bodyBuffer !== undefined) args.push("--data-binary", "@-");
  args.push(String(url));

  return new Promise<CurlFetchResponse>((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    const onAbort = () => {
      child.kill();
    };
    init.signal?.addEventListener("abort", onAbort);

    const cleanup = () => init.signal?.removeEventListener("abort", onAbort);

    child.stdout.on("data", (c: Buffer) => stdout.push(c));
    child.stderr.on("data", (c: Buffer) => stderr.push(c));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`curl-fetch: failed to spawn curl: ${err.message}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (init.signal?.aborted) {
        reject(new Error("curl-fetch: aborted"));
        return;
      }
      if (code !== 0) {
        // Never include stderr verbatim: curl does not print the URL on ordinary network
        // errors, but nothing guarantees that for every failure mode, and the URL carries
        // the bot token.
        reject(new Error(`curl-fetch: curl exited with code ${code}`));
        return;
      }
      resolve({
        json: async () => JSON.parse(Buffer.concat(stdout).toString("utf8")),
      });
    });

    if (bodyBuffer !== undefined) child.stdin.end(bodyBuffer);
    else child.stdin.end();
  });
}
