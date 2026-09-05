/**
 * Pure slot arithmetic. No DB, no timezone: everything is epoch milliseconds.
 * The DB-aware layer (availability.ts) builds the inputs.
 */
export type Interval = { start: number; end: number }; // [start, end) in ms

export type SlotInput = {
  working: Interval[]; // bookable windows for the day
  busy: Interval[]; // occupying bookings (any active status)
  durationMs: number;
  stepMs: number;
  bufferMs: number; // required gap after every appointment
  earliestStart: number; // now + minLead, in ms
};

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

/** Sort + merge touching/overlapping intervals. */
export function normalize(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else out.push({ ...cur });
  }
  return out;
}

/** a − b (set difference of interval lists) */
export function subtract(a: Interval[], b: Interval[]): Interval[] {
  let result = normalize(a);
  for (const cut of normalize(b)) {
    const next: Interval[] = [];
    for (const iv of result) {
      if (!overlaps(iv, cut)) {
        next.push(iv);
        continue;
      }
      if (iv.start < cut.start) next.push({ start: iv.start, end: cut.start });
      if (cut.end < iv.end) next.push({ start: cut.end, end: iv.end });
    }
    result = next;
  }
  return result;
}

/**
 * Candidate start times: step through each working window; keep starts where the appointment
 * fits inside the window, starts no earlier than `earliestStart`, and respects the buffer against
 * every busy interval (gap after the previous appointment AND before the next one).
 */
export function computeSlots(input: SlotInput): number[] {
  const { durationMs, stepMs, bufferMs, earliestStart } = input;
  if (durationMs <= 0 || stepMs <= 0) return [];
  const busy = normalize(input.busy);
  const out: number[] = [];
  for (const w of normalize(input.working)) {
    for (let t = w.start; t + durationMs <= w.end; t += stepMs) {
      if (t < earliestStart) continue;
      const end = t + durationMs;
      const clash = busy.some((b) => t < b.end + bufferMs && end + bufferMs > b.start);
      if (!clash) out.push(t);
    }
  }
  return out;
}

/** Does [start, start+duration) fit entirely in a working window and clear all busy intervals? */
export function isStartValid(input: SlotInput, start: number): boolean {
  const end = start + input.durationMs;
  if (start < input.earliestStart) return false;
  const inWindow = normalize(input.working).some((w) => start >= w.start && end <= w.end);
  if (!inWindow) return false;
  return !normalize(input.busy).some(
    (b) => start < b.end + input.bufferMs && end + input.bufferMs > b.start,
  );
}
