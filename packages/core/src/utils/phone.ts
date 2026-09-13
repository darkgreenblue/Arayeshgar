/**
 * Iranian mobile numbers, canonical form: 09xxxxxxxxx (11 digits).
 * Accepts Persian/Arabic digits, +98 / 0098 / 98 prefixes, spaces and dashes.
 */
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toEnglishDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) return String(p);
    const a = ARABIC_DIGITS.indexOf(ch);
    return a >= 0 ? String(a) : ch;
  });
}

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

export function normalizeIranMobile(raw: string): string | null {
  let s = toEnglishDigits(raw).replace(/[\s\-()]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("0098")) s = "0" + s.slice(4);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (s.startsWith("9") && s.length === 10) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

/** 0912 345 6789 for display */
export function formatIranMobile(normalized: string, persianDigits = true): string {
  const f = `${normalized.slice(0, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7)}`;
  return persianDigits ? toPersianDigits(f) : f;
}

/** 6037-9912-3456-7890 */
export function formatCardNumber(card: string, persianDigits = true): string {
  const d = toEnglishDigits(card).replace(/\D/g, "");
  const f = d.replace(/(.{4})(?=.)/g, "$1-");
  return persianDigits ? toPersianDigits(f) : f;
}

/** ۲۵۰٬۰۰۰ تومان */
export function formatToman(amount: number): string {
  return `${toPersianDigits(new Intl.NumberFormat("en-US").format(amount).replace(/,/g, "٬"))} تومان`;
}

/**
 * Wrap a Latin run so it keeps its place inside Persian text.
 *
 * Booking codes are six Latin letters, and in an RTL sentence the neutral characters around
 * them (`:` and spaces) take the paragraph's direction, so `کد رزرو: PKFNDU` renders with the
 * colon on the wrong side of the code. Cosmetic rather than unreadable — but this string is
 * the one the customer keeps and re-reads, so it is worth getting right.
 *
 * U+2068 FIRST STRONG ISOLATE / U+2069 POP DIRECTIONAL ISOLATE, which is what `<bdi>` does in
 * HTML. Used here rather than markup because these strings go to Telegram, which has no
 * `<bdi>` — the Unicode characters are the only mechanism available in a chat message.
 * On the web, prefer `<bdi>`.
 */
export function isolate(text: string): string {
  return `⁨${text}⁩`;
}
