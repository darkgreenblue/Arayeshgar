import { InlineKeyboard, Keyboard } from "grammy";
import type { Button } from "@arayeshgar/core";
import { encode, shortId, type Callback } from "./callback";

/**
 * Core notifications use durable, platform-neutral booking references such as
 * `bk:approve:<uuid>`. Telegram handlers, on the other hand, only accept the
 * compact versioned callback codec. Keep that translation at this boundary so
 * a notification button can never be delivered with data the bot cannot read.
 */
function callbackData(data: string | undefined): string {
  if (!data) return encode({ a: "noop" });
  const [scope, action, bookingId, ...rest] = data.split(":");
  if (
    scope === "bk" &&
    rest.length === 0 &&
    bookingId &&
    (action === "receipt" || action === "approve" || action === "reject")
  ) {
    return encode({ a: action, b: shortId(bookingId) });
  }
  return data;
}

/** Renders core's platform-agnostic buttons into a grammY inline keyboard. */
export function toInlineKeyboard(rows: Button[][]): InlineKeyboard | undefined {
  if (!rows.length) return undefined;
  const kb = new InlineKeyboard();
  for (const row of rows) {
    for (const b of row) {
      if (b.url) kb.url(b.text, b.url);
      else kb.text(b.text, callbackData(b.data));
    }
    kb.row();
  }
  return kb;
}

export function grid(items: { text: string; cb: Callback }[], perRow = 3): InlineKeyboard {
  const kb = new InlineKeyboard();
  items.forEach((it, i) => {
    kb.text(it.text, encode(it.cb));
    if ((i + 1) % perRow === 0) kb.row();
  });
  return kb;
}

export const contactKeyboard = (label = "📱 ارسال شماره من") =>
  new Keyboard().requestContact(label).resized().oneTime();

export const removeKeyboard = { remove_keyboard: true as const };
