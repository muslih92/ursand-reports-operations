import { describe, expect, it } from "vitest";
import { inWindow, shiftLevel, shiftWindow } from "../src/lib/shift-status";

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

describe("shiftWindow", () => {
  it("day shift runs 06:00–18:00 the same day", () => {
    const w = shiftWindow(at(2026, 11, 22, 9, 30));
    expect(w.kind).toBe("day");
    expect(w.date).toBe("2026-11-22");
    expect(w.start).toEqual(at(2026, 11, 22, 6));
    expect(w.end).toEqual(at(2026, 11, 22, 18));
  });

  it("after midnight belongs to the night shift that started the previous evening", () => {
    const w = shiftWindow(at(2026, 11, 23, 2, 15));
    expect(w.kind).toBe("night");
    expect(w.date).toBe("2026-11-22");
    expect(w.start).toEqual(at(2026, 11, 22, 18));
    expect(w.end).toEqual(at(2026, 11, 23, 6));
  });

  it("offset -1 gives the previous shift", () => {
    const prev = shiftWindow(at(2026, 11, 22, 9), -1);
    expect(prev.kind).toBe("night");
    expect(prev.date).toBe("2026-11-21");
    const prevOfNight = shiftWindow(at(2026, 11, 22, 20), -1);
    expect(prevOfNight.kind).toBe("day");
    expect(prevOfNight.date).toBe("2026-11-22");
  });

  it("boundaries: 06:00 is day, 18:00 is night", () => {
    expect(shiftWindow(at(2026, 11, 22, 6)).kind).toBe("day");
    expect(shiftWindow(at(2026, 11, 22, 18)).kind).toBe("night");
  });
});

describe("inWindow", () => {
  const w = shiftWindow(at(2026, 11, 22, 9));
  it("includes start, excludes end unless grace", () => {
    expect(inWindow(at(2026, 11, 22, 6).toISOString(), w)).toBe(true);
    expect(inWindow(at(2026, 11, 22, 18).toISOString(), w)).toBe(false);
    expect(inWindow(at(2026, 11, 22, 19).toISOString(), w, 2 * 3600_000)).toBe(true);
    expect(inWindow(null, w)).toBe(false);
    expect(inWindow("garbage", w)).toBe(false);
  });
});

describe("shiftLevel", () => {
  const empty = {
    checklist: null,
    shiftReport: false,
    readings: 0,
    openIsolations: 0,
    openWarnings: 0,
  };
  it("classifies progress", () => {
    expect(
      shiftLevel(
        { ...empty, checklist: { completionPct: 100, remarkCount: 0 }, shiftReport: true },
        false,
      ),
    ).toBe("complete");
    expect(shiftLevel({ ...empty, shiftReport: true }, true)).toBe("partial");
    expect(shiftLevel({ ...empty, readings: 3 }, true)).toBe("partial");
    expect(shiftLevel(empty, false)).toBe("pending");
    expect(shiftLevel(empty, true)).toBe("missing");
  });
});
