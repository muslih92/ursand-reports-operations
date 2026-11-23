import { describe, expect, it } from "vitest";
import {
  WIDGET_IDS,
  defaultLayout,
  matchPreset,
  moveWidget,
  normalizeLayout,
  presetRange,
  updateWidget,
} from "../src/lib/dashboard-layout";

describe("normalizeLayout", () => {
  it("falls back to the default for junk", () => {
    expect(normalizeLayout(null)).toEqual(defaultLayout());
    expect(normalizeLayout("x")).toEqual(defaultLayout());
    expect(normalizeLayout({ version: 2, widgets: [] })).toEqual(defaultLayout());
  });

  it("keeps saved order, drops unknown and duplicate ids, appends new widgets", () => {
    const l = normalizeLayout({
      version: 1,
      density: "compact",
      widgets: [
        { id: "mdr", visible: false, size: "full" },
        { id: "nope", visible: true, size: "full" },
        { id: "mdr", visible: true, size: "full" },
        { id: "kpis", visible: true, size: "half" },
      ],
    });
    expect(l.density).toBe("compact");
    expect(l.widgets[0]).toEqual({ id: "mdr", visible: false, size: "full" });
    // kpis only allows full
    expect(l.widgets[1]).toEqual({ id: "kpis", visible: true, size: "full" });
    expect(l.widgets.map((w) => w.id).sort()).toEqual([...WIDGET_IDS].sort());
  });
});

describe("moveWidget / updateWidget", () => {
  it("moves within bounds only", () => {
    const l = defaultLayout();
    const first = l.widgets[0]!.id;
    expect(moveWidget(l, first, -1)).toBe(l);
    const moved = moveWidget(l, first, 1);
    expect(moved.widgets[1]!.id).toBe(first);
  });

  it("rejects sizes a widget does not allow", () => {
    const l = updateWidget(defaultLayout(), "kpis", { size: "half" });
    expect(l.widgets.find((w) => w.id === "kpis")!.size).toBe("full");
    const l2 = updateWidget(defaultLayout(), "readingsChart", { size: "full", visible: false });
    expect(l2.widgets.find((w) => w.id === "readingsChart")).toEqual({
      id: "readingsChart",
      visible: false,
      size: "full",
    });
  });
});

describe("presets", () => {
  const now = new Date("2026-11-23T08:00:00Z");
  it("computes ranges", () => {
    expect(presetRange("today", now)).toEqual({ from: "2026-11-23", to: "2026-11-23" });
    expect(presetRange("7d", now)).toEqual({ from: "2026-11-17", to: "2026-11-23" });
    expect(presetRange("30d", now)).toEqual({ from: "2026-10-25", to: "2026-11-23" });
    expect(presetRange("month", now)).toEqual({ from: "2026-11-01", to: "2026-11-23" });
  });
  it("recognizes a preset from dates", () => {
    expect(matchPreset("2026-11-17", "2026-11-23", now)).toBe("7d");
    expect(matchPreset("2026-11-10", "2026-11-23", now)).toBeNull();
  });
});
