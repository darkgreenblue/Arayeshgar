/**
 * Callback data codec. The booking flow is stateless: every choice a customer makes is encoded
 * in the button itself, so restarts, several devices and Bale's weaker session support all work.
 * Format: "v1|<action>|<arg>|<arg>…" — kept under 64 bytes by using short ids (see shortId).
 */
export type Callback =
  | { a: "svc"; svc: string } // service chosen
  | { a: "stf"; svc: string; stf: string } // staff chosen ("any" allowed)
  | { a: "day"; svc: string; stf: string; day: string } // jalali key 1405/06/15
  | { a: "slot"; svc: string; stf: string; day: string; t: string } // t = minutes-since-epoch (compact)
  | { a: "back"; to: "svc" | "stf" | "day" }
  | { a: "receipt"; b: string } // customer will send a receipt for booking (short id)
  | { a: "cancel"; b: string }
  | { a: "approve"; b: string }
  | { a: "reject"; b: string }
  | { a: "adm"; v: "today" | "tomorrow" | "pending" | "close" }
  | { a: "noop" };

const SEP = "|";

export function encode(cb: Callback): string {
  const parts: string[] = ["v1", cb.a];
  switch (cb.a) {
    case "svc":
      parts.push(cb.svc);
      break;
    case "stf":
      parts.push(cb.svc, cb.stf);
      break;
    case "day":
      parts.push(cb.svc, cb.stf, cb.day);
      break;
    case "slot":
      parts.push(cb.svc, cb.stf, cb.day, cb.t);
      break;
    case "back":
      parts.push(cb.to);
      break;
    case "receipt":
    case "cancel":
    case "approve":
    case "reject":
      parts.push(cb.b);
      break;
    case "adm":
      parts.push(cb.v);
      break;
    case "noop":
      break;
  }
  const s = parts.join(SEP);
  if (Buffer.byteLength(s) > 64)
    throw new Error(`callback_data too long (${Buffer.byteLength(s)}B): ${s}`);
  return s;
}

export function decode(data: string): Callback | null {
  const p = data.split(SEP);
  if (p[0] !== "v1") return null;
  const [, a, x, y, z, w] = p;
  switch (a) {
    case "svc":
      return x ? { a, svc: x } : null;
    case "stf":
      return x && y ? { a, svc: x, stf: y } : null;
    case "day":
      return x && y && z ? { a, svc: x, stf: y, day: z } : null;
    case "slot":
      return x && y && z && w ? { a, svc: x, stf: y, day: z, t: w } : null;
    case "back":
      return x === "svc" || x === "stf" || x === "day" ? { a, to: x } : null;
    case "receipt":
    case "cancel":
    case "approve":
    case "reject":
      return x ? { a, b: x } : null;
    case "adm":
      return x === "today" || x === "tomorrow" || x === "pending" || x === "close"
        ? { a, v: x }
        : null;
    case "noop":
      return { a: "noop" };
    default:
      return null;
  }
}

/** UUIDs are 36 chars; two of them blow the 64-byte budget. We carry the first 8 hex chars. */
export function shortId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 8);
}
export function matchesShort(uuid: string, short: string): boolean {
  return shortId(uuid) === short;
}

/** Instant <-> compact string (minutes since epoch, base36). */
export function packTime(d: Date): string {
  return Math.floor(d.getTime() / 60_000).toString(36);
}
export function unpackTime(s: string): Date {
  return new Date(parseInt(s, 36) * 60_000);
}
