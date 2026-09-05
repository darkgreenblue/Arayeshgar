import { InlineKeyboard, Keyboard } from "grammy";
import type { Button } from "@arayeshgar/core";
import { encode, type Callback } from "./callback";

/** Renders core's platform-agnostic buttons into a grammY inline keyboard. */
export function toInlineKeyboard(rows: Button[][]): InlineKeyboard | undefined {
  if (!rows.length) return undefined;
  const kb = new InlineKeyboard();
  for (const row of rows) {
    for (const b of row) {
      if (b.url) kb.url(b.text, b.url);
      else kb.text(b.text, b.data ?? encode({ a: "noop" }));
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
