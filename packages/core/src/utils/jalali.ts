/**
 * Jalali (Persian calendar) + Asia/Tehran helpers. Everything stored in the DB is an instant
 * (timestamptz). These helpers convert instants <-> tenant-local wall-clock for scheduling.
 */
import { isValidJalaaliDate, toGregorian, toJalaali } from "jalaali-js";
import { toPersianDigits } from "./phone";

export const TEHRAN_TZ = "Asia/Tehran";

export type LocalDate = { y: number; m: number; d: number }; // Gregorian, tenant-local
export type JalaliDate = { jy: number; jm: number; jd: number };

const WEEKDAYS_FA = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const MONTHS_FA = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

function partsIn(tz: string, date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(date))
    if (part.type !== "literal") p[part.type] = Number(part.value);
  return { y: p.year!, m: p.month!, d: p.day!, hh: p.hour! % 24, mm: p.minute!, ss: p.second! };
}

/** Wall-clock components of an instant in a timezone. */
export function toLocal(date: Date, tz = TEHRAN_TZ) {
  return partsIn(tz, date);
}

/** UTC offset in minutes of `tz` at the given instant (Tehran: +210, no DST since 2022). */
export function tzOffsetMinutes(date: Date, tz = TEHRAN_TZ): number {
  const p = partsIn(tz, date);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** Instant for a local wall-clock time (minutes after midnight) on a local date. */
export function localToInstant(day: LocalDate, minutesFromMidnight: number, tz = TEHRAN_TZ): Date {
  const guess = new Date(Date.UTC(day.y, day.m - 1, day.d, 0, 0, 0) + minutesFromMidnight * 60_000);
  const offset = tzOffsetMinutes(guess, tz);
  const result = new Date(guess.getTime() - offset * 60_000);
  // second pass handles the rare case of crossing an offset change (not applicable to Tehran today)
  const offset2 = tzOffsetMinutes(result, tz);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60_000);
}

export function localDateOf(date: Date, tz = TEHRAN_TZ): LocalDate {
  const p = partsIn(tz, date);
  return { y: p.y, m: p.m, d: p.d };
}

export function addDays(day: LocalDate, n: number): LocalDate {
  const d = new Date(Date.UTC(day.y, day.m - 1, day.d + n));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** Persian weekday index: 0 = Saturday ... 6 = Friday. */
export function persianWeekday(day: LocalDate): number {
  const jsDay = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay(); // 0 = Sunday
  return (jsDay + 1) % 7;
}

export function toJalali(day: LocalDate): JalaliDate {
  return toJalaali(day.y, day.m, day.d);
}

export function fromJalali(j: JalaliDate): LocalDate {
  const g = toGregorian(j.jy, j.jm, j.jd);
  return { y: g.gy, m: g.gm, d: g.gd };
}

/** "1404/06/15" (ISO-like, for URLs and callback_data; ASCII digits) */
export function jalaliKey(day: LocalDate): string {
  const j = toJalali(day);
  return `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
}

export function parseJalaliKey(key: string): LocalDate | null {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(key);
  if (!m) return null;
  const j = { jy: Number(m[1]), jm: Number(m[2]), jd: Number(m[3]) };
  if (!isValidJalaaliDate(j.jy, j.jm, j.jd)) return null;
  return fromJalali(j);
}

/** "سه‌شنبه ۱۵ شهریور" */
export function formatJalaliLong(day: LocalDate): string {
  const j = toJalali(day);
  return `${WEEKDAYS_FA[persianWeekday(day)]} ${toPersianDigits(j.jd)} ${MONTHS_FA[j.jm - 1]}`;
}

/** "۱۴:۳۰" */
export function formatMinutes(minutesFromMidnight: number): string {
  const hh = Math.floor(minutesFromMidnight / 60);
  const mm = minutesFromMidnight % 60;
  return toPersianDigits(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
}

/** "سه‌شنبه ۱۵ شهریور، ساعت ۱۴:۳۰" */
export function formatInstantFa(date: Date, tz = TEHRAN_TZ): string {
  const p = partsIn(tz, date);
  return `${formatJalaliLong({ y: p.y, m: p.m, d: p.d })}، ساعت ${formatMinutes(p.hh * 60 + p.mm)}`;
}

/** Gregorian "YYYY-MM-DD" (for the `date` column) */
export function isoDate(day: LocalDate): string {
  return `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
}
