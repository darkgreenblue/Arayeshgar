import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { curlFetch } from "../src/platform/curl-fetch";

describe("curlFetch", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/echo-json") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true, method: req.method, receivedBody: body }));
        });
        return;
      }
      if (req.url === "/echo-multipart") {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              contentType: req.headers["content-type"],
              length: Buffer.concat(chunks).length,
            }),
          );
        });
        return;
      }
      if (req.url === "/not-found") {
        res.statusCode = 404;
        res.end("nope");
        return;
      }
      if (req.url === "/slow") {
        setTimeout(() => res.end("{}"), 3000);
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no address");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("sends a JSON body and parses the JSON response", async () => {
    const res = await curlFetch(`${baseUrl}/echo-json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"hello":"world"}',
    });
    const data = (await res.json()) as { ok: boolean; method: string; receivedBody: string };
    expect(data.ok).toBe(true);
    expect(data.method).toBe("POST");
    expect(data.receivedBody).toBe('{"hello":"world"}');
  });

  it("forwards a Readable stream body verbatim, matching grammY's multipart shape", async () => {
    const payload = "----boundary\r\nContent-Disposition: form-data\r\n\r\ndata\r\n----boundary--";
    const stream = Readable.from([Buffer.from(payload)]);
    const res = await curlFetch(`${baseUrl}/echo-multipart`, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=----boundary" },
      body: stream,
    });
    const data = (await res.json()) as { contentType: string; length: number };
    expect(data.contentType).toBe("multipart/form-data; boundary=----boundary");
    expect(data.length).toBe(Buffer.byteLength(payload));
  });

  it("rejects when curl gets a non-2xx-but-still-JSON response (matches fetch: resolves, caller inspects body)", async () => {
    // Telegram returns 200 with an ok:false JSON body for API errors, and grammY only ever
    // inspects the parsed body -- but a transport-level 404 (wrong URL entirely) has no JSON
    // body at all, and curl itself still exits 0 for a plain HTTP error status without -f.
    // json() should throw on the non-JSON body in that case, same as native fetch would.
    const res = await curlFetch(`${baseUrl}/not-found`, { method: "GET" });
    await expect(res.json()).rejects.toThrow();
  });

  it("rejects when the signal is aborted before curl finishes", async () => {
    const controller = new AbortController();
    const pending = curlFetch(`${baseUrl}/slow`, { method: "GET", signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(pending).rejects.toThrow();
  });

  it("rejects when curl cannot reach the host at all", async () => {
    await expect(curlFetch("http://127.0.0.1:1", { method: "GET" })).rejects.toThrow();
  });
});
