import { useCallback, useEffect, useState } from "react";

/**
 * Per-user dashboard layout: which widgets show, in what order, and how wide.
 * Stored in this browser only (localStorage); a missing or broken value falls
 * back to the default layout, so the dashboard always renders.
 */

export type WidgetSize = "full" | "half" | "third" | "twoThirds";
export type Density = "comfortable" | "compact";

export const WIDGET_IDS = [
  "highlights",
  "kpis",
  "routine",
  "readingsChart",
  "incidentsChart",
  "reportsChart",
  "recentReports",
  "equipment",
  "mdr",
  "fireTests",
  "generatorTests",
  "recentIncidents",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export interface WidgetState {
  id: WidgetId;
  visible: boolean;
  size: WidgetSize;
}

export interface DashboardLayout {
  version: 1;
  widgets: WidgetState[];
  density: Density;
}

/** Sizes a user may pick for each widget; the first is the default. */
export const WIDGET_SIZES: Record<WidgetId, WidgetSize[]> = {
  highlights: ["full"],
  kpis: ["full"],
  routine: ["full", "half"],
  readingsChart: ["half", "full", "third"],
  incidentsChart: ["half", "full", "third"],
  reportsChart: ["half", "full", "third"],
  recentReports: ["half", "full", "third"],
  equipment: ["third", "half", "full"],
  mdr: ["twoThirds", "full"],
  fireTests: ["half", "full", "third"],
  generatorTests: ["half", "full", "third"],
  recentIncidents: ["full", "half"],
};

export function defaultLayout(): DashboardLayout {
  return {
    version: 1,
    density: "comfortable",
    widgets: WIDGET_IDS.map((id) => ({ id, visible: true, size: WIDGET_SIZES[id][0]! })),
  };
}

/**
 * Accept a stored value only where it is valid: unknown widgets are dropped,
 * new widgets are appended visible, sizes outside the allowed set reset.
 */
export function normalizeLayout(raw: unknown): DashboardLayout {
  const base = defaultLayout();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<DashboardLayout>;
  if (r.version !== 1 || !Array.isArray(r.widgets)) return base;
  const seen = new Set<WidgetId>();
  const widgets: WidgetState[] = [];
  for (const w of r.widgets) {
    if (!w || typeof w !== "object") continue;
    const id = (w as WidgetState).id;
    if (!(WIDGET_IDS as readonly string[]).includes(id) || seen.has(id)) continue;
    seen.add(id);
    const allowed = WIDGET_SIZES[id];
    const size = allowed.includes((w as WidgetState).size) ? (w as WidgetState).size : allowed[0]!;
    widgets.push({ id, visible: (w as WidgetState).visible !== false, size });
  }
  for (const w of base.widgets) if (!seen.has(w.id)) widgets.push(w);
  return {
    version: 1,
    density: r.density === "compact" ? "compact" : "comfortable",
    widgets,
  };
}

export function moveWidget(layout: DashboardLayout, id: WidgetId, delta: -1 | 1): DashboardLayout {
  const i = layout.widgets.findIndex((w) => w.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= layout.widgets.length) return layout;
  const widgets = layout.widgets.slice();
  [widgets[i], widgets[j]] = [widgets[j]!, widgets[i]!];
  return { ...layout, widgets };
}

export function updateWidget(
  layout: DashboardLayout,
  id: WidgetId,
  patch: Partial<Omit<WidgetState, "id">>,
): DashboardLayout {
  return {
    ...layout,
    widgets: layout.widgets.map((w) => {
      if (w.id !== id) return w;
      const next = { ...w, ...patch };
      if (!WIDGET_SIZES[id].includes(next.size)) next.size = w.size;
      return next;
    }),
  };
}

/** Grid classes on a 6-column large-screen grid; everything stacks on mobile. */
export const SIZE_CLASS: Record<WidgetSize, string> = {
  full: "lg:col-span-6",
  half: "lg:col-span-3",
  third: "md:col-span-1 lg:col-span-2",
  twoThirds: "lg:col-span-4",
};

export function useDashboardLayout(userId: string | undefined) {
  const key = `urs-dashboard-layout:${userId ?? "anon"}`;
  const [layout, setLayout] = useState<DashboardLayout>(defaultLayout);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      setLayout(raw ? normalizeLayout(JSON.parse(raw)) : defaultLayout());
    } catch {
      setLayout(defaultLayout());
    }
  }, [key]);

  const save = useCallback(
    (next: DashboardLayout) => {
      setLayout(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage unavailable: layout still applies for this visit */
      }
    },
    [key],
  );

  const reset = useCallback(() => {
    setLayout(defaultLayout());
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [key]);

  return { layout, save, reset };
}

/** Date-range presets for the toolbar. Dates are YYYY-MM-DD in UTC, like the rest of the app. */
export type RangePreset = "today" | "7d" | "30d" | "month";

export function presetRange(p: RangePreset, now: Date = new Date()): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const to = iso(now);
  const d = new Date(now);
  if (p === "today") return { from: to, to };
  if (p === "7d") d.setUTCDate(d.getUTCDate() - 6);
  else if (p === "30d") d.setUTCDate(d.getUTCDate() - 29);
  else d.setUTCDate(1);
  return { from: iso(d), to };
}

export function matchPreset(from: string, to: string, now: Date = new Date()): RangePreset | null {
  for (const p of ["today", "7d", "30d", "month"] as RangePreset[]) {
    const r = presetRange(p, now);
    if (r.from === from && r.to === to) return p;
  }
  return null;
}
