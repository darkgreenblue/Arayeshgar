/**
 * Bale Bot API compatibility probe.
 * Run: BALE_BOT_TOKEN=... pnpm bale:probe   (optionally BALE_TEST_CHAT_ID=<your chat id>)
 *
 * Checks, against https://tapi.bale.ai, the calls our bots rely on and prints a capability map.
 * Results are recorded in docs/RESEARCH.md and drive apps/bots/src/platform/capabilities.ts.
 */
const root = process.env.BALE_API_ROOT ?? "https://tapi.bale.ai";
const token = process.env.BALE_BOT_TOKEN;
const chatId = process.env.BALE_TEST_CHAT_ID;

if (!token) {
  console.error("BALE_BOT_TOKEN is required");
  process.exit(2);
}

type Result = { method: string; ok: boolean; note: string };
const results: Result[] = [];

async function call(
  method: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(`${root}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep text */
  }
  const ok = typeof data === "object" && data !== null && (data as { ok?: boolean }).ok === true;
  return { ok, data };
}

async function probe(method: string, body?: Record<string, unknown>, note = "") {
  try {
    const r = await call(method, body);
    results.push({ method, ok: r.ok, note: r.ok ? note : JSON.stringify(r.data).slice(0, 200) });
  } catch (err) {
    results.push({ method, ok: false, note: String(err) });
  }
}

async function main() {
  await probe("getMe");
  await probe("getWebhookInfo");
  await probe(
    "setWebhook",
    { url: "https://example.invalid/hooks/bale/probe/secret" },
    "accepted a webhook URL",
  );
  await probe("deleteWebhook");
  if (chatId) {
    await probe("sendMessage", { chat_id: chatId, text: "probe: plain text" });
    await probe(
      "sendMessage",
      {
        chat_id: chatId,
        text: "probe: inline keyboard",
        reply_markup: { inline_keyboard: [[{ text: "دکمه", callback_data: "probe:1" }]] },
      },
      "inline keyboard rendered",
    );
    await probe(
      "sendMessage",
      {
        chat_id: chatId,
        text: "probe: contact share keyboard",
        reply_markup: {
          keyboard: [[{ text: "ارسال شماره", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
      "request_contact keyboard rendered",
    );
    await probe(
      "sendPhoto",
      {
        chat_id: chatId,
        photo:
          "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png",
        caption: "probe: photo by URL",
      },
      "photo by URL",
    );
  } else {
    results.push({
      method: "sendMessage/sendPhoto",
      ok: false,
      note: "skipped: set BALE_TEST_CHAT_ID (send /start to the bot, then read getUpdates)",
    });
  }
  await probe("getUpdates", { limit: 1 });

  console.log("\nBale capability probe against", root);
  for (const r of results)
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.method.padEnd(18)} ${r.note}`);
  console.log(
    "\nManual checks still needed: tap the inline button and confirm callback_query arrives; send a photo to the bot and confirm getFile + download from /file/bot<TOKEN>/<path> works; test answerCallbackQuery.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
