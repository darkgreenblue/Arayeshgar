import { randomInt } from "node:crypto";

/** Unambiguous uppercase alphabet (no 0/O, 1/I/L). 6 chars => ~8.9e8 combinations per tenant. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateBookingCode(length = 6): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** Uppercase, strip separators, map the look-alikes users type (0→O is impossible: neither is in the alphabet). */
export function normalizeBookingCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}
