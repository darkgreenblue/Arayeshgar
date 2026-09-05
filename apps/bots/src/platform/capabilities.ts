/**
 * Bale's Bot API is Telegram-compatible at the wire level (same methods, different apiRoot),
 * but a few features differ or are missing on older clients. Everything uncertain goes behind
 * this map so a probe result (scripts/bale-probe.ts) can flip behaviour without touching flows.
 *
 * Sources and probe results: docs/RESEARCH.md §1.
 */
import type { Platform } from "@arayeshgar/db";

export type Capabilities = {
  /** answerCallbackQuery: present on Telegram; Bale added it in 2025 but old clients ignore it. */
  answerCallbackQuery: boolean;
  /** editMessageText/editMessageReplyMarkup for in-place flow updates. */
  editMessage: boolean;
  /** reply keyboard button with request_contact (how we collect the phone number). */
  requestContact: boolean;
  /** sending a photo as multipart upload (receipt forwarding to admins). */
  sendPhotoMultipart: boolean;
  /** inline mode (@bot query) — not used by any flow; assumed absent on Bale. */
  inlineMode: boolean;
  /** max bytes in callback_data (Telegram: 64). */
  maxCallbackData: number;
};

export const CAPABILITIES: Record<Platform, Capabilities> = {
  telegram: {
    answerCallbackQuery: true,
    editMessage: true,
    requestContact: true,
    sendPhotoMultipart: true,
    inlineMode: true,
    maxCallbackData: 64,
  },
  bale: {
    // Conservative defaults: every flow must work without them. Flip after a real probe.
    answerCallbackQuery: true, // failures are swallowed, see safeAnswerCallback
    editMessage: true,
    requestContact: true,
    sendPhotoMultipart: true,
    inlineMode: false,
    maxCallbackData: 64,
  },
};

export function apiRootFor(platform: Platform): string {
  return platform === "telegram"
    ? (process.env.TELEGRAM_API_ROOT ?? "https://api.telegram.org")
    : (process.env.BALE_API_ROOT ?? "https://tapi.bale.ai");
}
