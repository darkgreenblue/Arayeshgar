/**
 * Minimal stand-in for the Telegram/Bale Bot API. Records every outgoing call so tests can assert
 * what the bot said, and serves file downloads for the receipt flow.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export type Call = { method: string; body: Record<string, unknown> };

export class MockApi {
  readonly calls: Call[] = [];
  private server?: Server;
  private fileBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(256)]); // tiny JPEG

  async start(): Promise<string> {
    this.server = createServer(async (req, res) => {
      const url = req.url ?? "";
      // file download: /file/bot<token>/<path>
      if (url.startsWith("/file/")) {
        res.writeHead(200, { "content-type": "image/jpeg" });
        res.end(this.fileBytes);
        return;
      }
      const method = url.split("/").pop() ?? "";
      let body: Record<string, unknown> = {};
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const raw = Buffer.concat(chunks);
      const ct = req.headers["content-type"] ?? "";
      if (ct.includes("application/json") && raw.length) {
        try {
          body = JSON.parse(raw.toString());
        } catch {
          body = { _unparsed: raw.toString().slice(0, 200) };
        }
      } else if (raw.length) {
        // multipart (sendPhoto): capture the text fields we care about
        const text = raw.toString("latin1");
        for (const field of ["chat_id", "caption"]) {
          const m = new RegExp(`name="${field}"\\r\\n\\r\\n([^\\r]*)`).exec(text);
          if (m) body[field] = Buffer.from(m[1]!, "latin1").toString("utf8");
        }
        body._multipart = true;
      }
      this.calls.push({ method, body });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: this.resultFor(method) }));
    });
    await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", r));
    const { port } = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  private resultFor(method: string): unknown {
    switch (method) {
      case "getMe":
        return {
          id: 777,
          is_bot: true,
          first_name: "TestBot",
          username: "test_bot",
          can_join_groups: true,
          can_read_all_group_messages: false,
          supports_inline_queries: false,
        };
      case "getWebhookInfo":
        return { url: "", has_custom_certificate: false, pending_update_count: 0 };
      case "getFile":
        return {
          file_id: "f1",
          file_unique_id: "u1",
          file_size: 260,
          file_path: "photos/file_1.jpg",
        };
      case "sendMessage":
      case "sendPhoto":
        return {
          message_id: this.calls.length,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 1, type: "private" },
          text: "",
        };
      default:
        return true;
    }
  }

  find(method: string): Call[] {
    return this.calls.filter((c) => c.method === method);
  }
  last(method: string): Call | undefined {
    return [...this.calls].reverse().find((c) => c.method === method);
  }
  texts(): string[] {
    return this.find("sendMessage").map((c) => String(c.body.text ?? ""));
  }
  clear() {
    this.calls.length = 0;
  }
  async stop() {
    await new Promise<void>((r) => this.server?.close(() => r()));
  }
}

/** Builds Telegram-shaped updates. */
let updateId = 1000;
export const upd = {
  command(text: string, from = 5551, chatId = from) {
    return {
      update_id: updateId++,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "private" as const },
        from: { id: from, is_bot: false, first_name: "رضا" },
        text,
        entities: text.startsWith("/")
          ? [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0]!.length }]
          : [],
      },
    };
  },
  callback(data: string, from = 5551, chatId = from) {
    return {
      update_id: updateId++,
      callback_query: {
        id: String(updateId),
        from: { id: from, is_bot: false, first_name: "رضا" },
        chat_instance: "ci",
        data,
        message: {
          message_id: updateId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: chatId, type: "private" as const },
          from: { id: 777, is_bot: true, first_name: "TestBot" },
          text: "…",
        },
      },
    };
  },
  contact(phone: string, from = 5551, chatId = from) {
    return {
      update_id: updateId++,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "private" as const },
        from: { id: from, is_bot: false, first_name: "رضا" },
        contact: { phone_number: phone, first_name: "رضا", user_id: from },
      },
    };
  },
  photo(from = 5551, chatId = from) {
    return {
      update_id: updateId++,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "private" as const },
        from: { id: from, is_bot: false, first_name: "رضا" },
        photo: [
          { file_id: "small", file_unique_id: "s", width: 90, height: 90, file_size: 100 },
          { file_id: "big", file_unique_id: "b", width: 800, height: 800, file_size: 260 },
        ],
      },
    };
  },
};
