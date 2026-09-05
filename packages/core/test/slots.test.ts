import { describe, expect, it } from "vitest";
import { computeSlots, isStartValid, normalize, subtract } from "../src/availability/slots";

const M = 60_000;
const at = (min: number) => min * M; // minutes since an arbitrary day start

describe("interval helpers", () => {
  it("normalize merges overlapping and touching intervals", () => {
    expect(
      normalize([
        { start: at(0), end: at(60) },
        { start: at(60), end: at(90) },
        { start: at(200), end: at(210) },
      ]),
    ).toEqual([
      { start: at(0), end: at(90) },
      { start: at(200), end: at(210) },
    ]);
  });
  it("subtract cuts holes", () => {
    expect(subtract([{ start: at(0), end: at(120) }], [{ start: at(30), end: at(60) }])).toEqual([
      { start: at(0), end: at(30) },
      { start: at(60), end: at(120) },
    ]);
  });
});

describe("computeSlots", () => {
  const base = {
    working: [{ start: at(600), end: at(720) }],
    busy: [],
    durationMs: 30 * M,
    stepMs: 15 * M,
    bufferMs: 0,
    earliestStart: 0,
  };

  it("steps through the window and keeps only starts where the service fits", () => {
    expect(computeSlots(base).map((t) => t / M)).toEqual([600, 615, 630, 645, 660, 675, 690]);
  });
  it("removes starts that collide with busy intervals", () => {
    const slots = computeSlots({ ...base, busy: [{ start: at(630), end: at(660) }] }).map(
      (t) => t / M,
    );
    expect(slots).toEqual([600, 660, 675, 690]);
  });
  it("respects the buffer on both sides of a busy interval", () => {
    const slots = computeSlots({
      ...base,
      bufferMs: 10 * M,
      busy: [{ start: at(630), end: at(660) }],
    }).map((t) => t / M);
    // needs to end by 620 (600 fits: ends 630 but buffer needs 620 → 600 clashes), so first is none before; after: start >= 670 → 675
    expect(slots).toEqual([675, 690]);
  });
  it("respects earliestStart (min lead time)", () => {
    expect(computeSlots({ ...base, earliestStart: at(650) }).map((t) => t / M)).toEqual([
      660, 675, 690,
    ]);
  });
  it("returns nothing for closed days or impossible durations", () => {
    expect(computeSlots({ ...base, working: [] })).toEqual([]);
    expect(computeSlots({ ...base, durationMs: 200 * M })).toEqual([]);
  });
  it("isStartValid mirrors computeSlots", () => {
    const input = { ...base, busy: [{ start: at(630), end: at(660) }] };
    expect(isStartValid(input, at(600))).toBe(true);
    expect(isStartValid(input, at(615))).toBe(false); // overlaps busy
    expect(isStartValid(input, at(700))).toBe(false); // ends after window
    expect(isStartValid(input, at(660))).toBe(true);
  });
});
