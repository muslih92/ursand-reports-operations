import { describe, expect, it } from "vitest";
import { ensureWritten, shiftDateISO } from "../src/lib/safe-write";

describe("ensureWritten", () => {
  it("passes rows through when the write landed", () => {
    expect(ensureWritten({ data: [{ id: "a" }], error: null }, "ar")).toEqual([{ id: "a" }]);
  });

  it("throws when RLS silently changed zero rows", () => {
    expect(() => ensureWritten({ data: [], error: null }, "ar")).toThrow(/لم يتم الحفظ/);
    expect(() => ensureWritten({ data: null, error: null }, "en")).toThrow(/Not saved/);
  });

  it("throws when fewer rows than expected were written", () => {
    expect(() => ensureWritten({ data: [{ id: "a" }], error: null }, "en", 3)).toThrow(/Not saved/);
  });

  it("rethrows a database error", () => {
    const err = new Error("boom");
    expect(() => ensureWritten({ data: null, error: err }, "en")).toThrow("boom");
  });
});

describe("shiftDateISO", () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 23, h, m); // local time, 23 Nov 2026
  it("keeps the day shift on the calendar date", () => {
    expect(shiftDateISO(at(6))).toBe("2026-11-23");
    expect(shiftDateISO(at(17, 59))).toBe("2026-11-23");
  });
  it("keeps the whole night shift on the date it started", () => {
    expect(shiftDateISO(at(18))).toBe("2026-11-23");
    expect(shiftDateISO(at(23, 59))).toBe("2026-11-23");
    expect(shiftDateISO(new Date(2026, 10, 24, 0, 30))).toBe("2026-11-23");
    expect(shiftDateISO(new Date(2026, 10, 24, 3, 30))).toBe("2026-11-23");
    expect(shiftDateISO(new Date(2026, 10, 24, 5, 59))).toBe("2026-11-23");
  });
  it("handles month boundaries", () => {
    expect(shiftDateISO(new Date(2026, 11, 1, 2))).toBe("2026-11-30");
  });
});
