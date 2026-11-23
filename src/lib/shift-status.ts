/**
 * Shift windows and per-station shift status for the supervisor board.
 *
 * Shifts follow readings.tsx: day 06:00–18:00, night 18:00–06:00 (next day),
 * in the viewer's local time. Records are matched by timestamp, not by their
 * stored date, because stored dates are UTC and a night shift spans two dates.
 */

export type ShiftKind = "day" | "night";

export interface ShiftWindow {
  kind: ShiftKind;
  /** Local calendar date (YYYY-MM-DD) on which the shift started. */
  date: string;
  start: Date;
  end: Date;
}

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The shift that contains `now`, or an earlier one when `offset` < 0. */
export function shiftWindow(now: Date = new Date(), offset = 0): ShiftWindow {
  const h = now.getHours();
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  if (h >= 6 && h < 18) {
    start.setHours(6);
  } else {
    if (h < 6) start.setDate(start.getDate() - 1);
    start.setHours(18);
  }
  // Each shift is 12 hours; step back whole shifts for offset.
  start.setHours(start.getHours() + offset * 12);
  const end = new Date(start);
  end.setHours(end.getHours() + 12);
  return {
    kind: start.getHours() === 6 ? "day" : "night",
    date: localISODate(start),
    start,
    end,
  };
}

/** Checklist frame stores shifts in Arabic; shift reports use day/night. */
export const CHECKLIST_SHIFT: Record<ShiftKind, string> = { day: "صباحي", night: "مسائي" };

export function inWindow(iso: string | null | undefined, w: ShiftWindow, graceMs = 0): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= w.start.getTime() && t < w.end.getTime() + graceMs;
}

export interface StationShiftFacts {
  checklist: { completionPct: number; remarkCount: number } | null;
  shiftReport: boolean;
  readings: number;
  openIsolations: number;
  openWarnings: number;
}

export type ShiftLevel = "complete" | "partial" | "missing" | "pending";

/**
 * complete: checklist and shift report both in.
 * partial: one of them in.
 * missing: nothing in and the shift has ended.
 * pending: nothing in yet but the shift is still running.
 */
export function shiftLevel(f: StationShiftFacts, shiftEnded: boolean): ShiftLevel {
  const done = Number(!!f.checklist) + Number(f.shiftReport);
  if (done === 2) return "complete";
  if (done === 1 || f.readings > 0) return "partial";
  return shiftEnded ? "missing" : "pending";
}
