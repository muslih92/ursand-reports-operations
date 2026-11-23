import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleDashed,
  AlertTriangle,
  XCircle,
  Moon,
  Sun,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScopedStations } from "@/lib/station-scope";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  CHECKLIST_SHIFT,
  inWindow,
  shiftLevel,
  shiftWindow,
  type ShiftLevel,
  type StationShiftFacts,
} from "@/lib/shift-status";

export const Route = createFileRoute("/_app/station-status")({
  head: () => ({
    meta: [
      { title: "Station Shift Status | WTCO" },
      {
        name: "description",
        content:
          "Live status of every station for the current shift: checklist, shift report, readings and open isolations.",
      },
    ],
  }),
  component: StationStatusPage,
});

/** Shift reports are often written right after the shift closes. */
const REPORT_GRACE_MS = 2 * 60 * 60 * 1000;

const LEVEL_STYLE: Record<
  ShiftLevel,
  { card: string; icon: typeof CheckCircle2; ar: string; en: string }
> = {
  complete: {
    card: "border-emerald-500/40 bg-emerald-500/10",
    icon: CheckCircle2,
    ar: "مكتملة",
    en: "Complete",
  },
  partial: {
    card: "border-amber-500/40 bg-amber-500/10",
    icon: AlertTriangle,
    ar: "جزئية",
    en: "Partial",
  },
  missing: {
    card: "border-destructive/50 bg-destructive/10",
    icon: XCircle,
    ar: "لم تُرسل",
    en: "Missing",
  },
  pending: {
    card: "border-border bg-card",
    icon: CircleDashed,
    ar: "قيد التنفيذ",
    en: "In progress",
  },
};

function StationStatusPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [offset, setOffset] = useState<0 | -1>(0);
  // Recompute the window on each refresh so a page left open rolls into the next shift.
  const [now, setNow] = useState(() => new Date());
  const win = useMemo(() => shiftWindow(now, offset), [now, offset]);
  const shiftEnded = Date.now() >= win.end.getTime();

  const { data: stations = [], isLoading: stationsLoading } = useScopedStations();
  const ids = stations.map((s) => s.id);
  const startISO = win.start.toISOString();
  const endISO = win.end.toISOString();
  const graceEndISO = new Date(win.end.getTime() + REPORT_GRACE_MS).toISOString();

  const {
    data: facts,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["station-shift-status", startISO, ids.join(",")],
    enabled: ids.length > 0,
    refetchInterval: offset === 0 ? 60_000 : false,
    queryFn: async () => {
      const [checklists, reports, readings, notes] = await Promise.all([
        supabase
          .from("checklist_reports")
          .select("station_id, shift, completion_pct, remark_count, submitted_at")
          .in("station_id", ids)
          .eq("shift", CHECKLIST_SHIFT[win.kind])
          .gte("submitted_at", startISO)
          .lt("submitted_at", endISO),
        supabase
          .from("shift_reports")
          .select("station_id, shift, updated_at")
          .in("station_id", ids)
          .eq("shift", win.kind)
          .gte("updated_at", startISO)
          .lt("updated_at", graceEndISO),
        supabase
          .from("reading_entries")
          .select("station_id, updated_at")
          .in("station_id", ids)
          .gte("updated_at", startISO)
          .lt("updated_at", endISO),
        supabase
          .from("station_notes")
          .select("station_id, category")
          .in("station_id", ids)
          .eq("status", "open"),
      ]);
      const failed = [checklists, reports, readings, notes].find((r) => r.error);
      if (failed?.error) throw failed.error;

      const map = new Map<string, StationShiftFacts>();
      for (const id of ids) {
        map.set(id, {
          checklist: null,
          shiftReport: false,
          readings: 0,
          openIsolations: 0,
          openWarnings: 0,
        });
      }
      for (const c of checklists.data ?? []) {
        const f = map.get(c.station_id);
        if (!f || !inWindow(c.submitted_at, win)) continue;
        // Keep the most complete checklist when several were submitted.
        const pct = Number(c.completion_pct ?? 0);
        if (!f.checklist || pct > f.checklist.completionPct) {
          f.checklist = { completionPct: Math.round(pct), remarkCount: c.remark_count ?? 0 };
        }
      }
      for (const r of reports.data ?? []) {
        const f = map.get(r.station_id);
        if (f && inWindow(r.updated_at, win, REPORT_GRACE_MS)) f.shiftReport = true;
      }
      for (const r of readings.data ?? []) {
        const f = map.get(r.station_id);
        if (f && inWindow(r.updated_at, win)) f.readings += 1;
      }
      for (const n of notes.data ?? []) {
        const f = map.get(n.station_id);
        if (!f) continue;
        if (n.category === "isolation") f.openIsolations += 1;
        else if (n.category === "warning") f.openWarnings += 1;
      }
      return map;
    },
  });

  const rows = stations.map((s) => {
    const f = facts?.get(s.id);
    return { station: s, facts: f, level: f ? shiftLevel(f, shiftEnded) : null };
  });
  const counts = rows.reduce(
    (acc, r) => {
      if (r.level) acc[r.level] += 1;
      return acc;
    },
    { complete: 0, partial: 0, missing: 0, pending: 0 } as Record<ShiftLevel, number>,
  );
  const isolations = rows.reduce((a, r) => a + (r.facts?.openIsolations ?? 0), 0);

  const ShiftIcon = win.kind === "day" ? Sun : Moon;
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString(ar ? "ar-SA" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const shiftName =
    win.kind === "day"
      ? ar
        ? "الوردية الصباحية"
        : "Day shift"
      : ar
        ? "الوردية المسائية"
        : "Night shift";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShiftIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">
              {ar ? "حالة المحطات في الوردية" : "Station shift status"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {shiftName} · {win.date} · {fmtTime(win.start)}–{fmtTime(win.end)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5">
            <Button
              size="sm"
              variant={offset === 0 ? "default" : "ghost"}
              onClick={() => setOffset(0)}
            >
              {ar ? "الوردية الحالية" : "Current shift"}
            </Button>
            <Button
              size="sm"
              variant={offset === -1 ? "default" : "ghost"}
              onClick={() => setOffset(-1)}
            >
              {ar ? "الوردية السابقة" : "Previous shift"}
            </Button>
          </div>
          <Button
            size="icon"
            variant="outline"
            aria-label={ar ? "تحديث" : "Refresh"}
            onClick={() => {
              setNow(new Date());
              void refetch();
            }}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(["complete", "partial", shiftEnded ? "missing" : "pending"] as ShiftLevel[]).map(
          (lvl) => {
            const s = LEVEL_STYLE[lvl];
            const Icon = s.icon;
            return (
              <div key={lvl} className={`rounded-lg border p-3 ${s.card}`}>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  {ar ? s.ar : s.en}
                </div>
                <div className="mt-1 text-2xl font-bold">{counts[lvl]}</div>
              </div>
            );
          },
        )}
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">{ar ? "المحطات" : "Stations"}</div>
          <div className="mt-1 text-2xl font-bold">{stations.length}</div>
        </div>
        <div
          className={`rounded-lg border p-3 ${isolations ? "border-destructive/50 bg-destructive/10" : ""}`}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
            {ar ? "عزل مفتوح" : "Open isolations"}
          </div>
          <div className="mt-1 text-2xl font-bold">{isolations}</div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          {ar ? "تعذر تحميل حالة المحطات." : "Could not load station status."}{" "}
          {(error as Error).message}
        </div>
      ) : null}

      {stationsLoading ? (
        <p className="text-sm text-muted-foreground">{ar ? "جاري التحميل…" : "Loading…"}</p>
      ) : stations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {ar ? "لا توجد محطات ضمن صلاحيتك." : "No stations in your scope."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ station, facts: f, level }) => {
            const s = level ? LEVEL_STYLE[level] : LEVEL_STYLE.pending;
            const Icon = s.icon;
            return (
              <div key={station.id} className={`rounded-xl border p-4 ${s.card}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{ar ? station.name_ar : station.name_en}</div>
                    <div className="text-xs text-muted-foreground">{station.code}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium">
                    <Icon className="h-4 w-4" />
                    {level ? (ar ? s.ar : s.en) : "…"}
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  <Fact
                    ok={!!f?.checklist}
                    label={ar ? "قائمة الفحص" : "Checklist"}
                    detail={
                      f?.checklist
                        ? `${f.checklist.completionPct}%${f.checklist.remarkCount ? ` · ${f.checklist.remarkCount} ${ar ? "ملاحظة" : "remarks"}` : ""}`
                        : undefined
                    }
                    to="/checklist"
                  />
                  <Fact
                    ok={!!f?.shiftReport}
                    label={ar ? "تقرير الوردية" : "Shift report"}
                    to="/reports"
                  />
                  <Fact
                    ok={(f?.readings ?? 0) > 0}
                    label={ar ? "القراءات" : "Readings"}
                    detail={f?.readings ? `${f.readings}` : undefined}
                    to="/readings"
                  />
                </ul>
                {f && (f.openIsolations > 0 || f.openWarnings > 0) ? (
                  <Link to="/station-notes" className="mt-3 flex flex-wrap gap-2 text-xs">
                    {f.openIsolations > 0 && (
                      <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">
                        {ar ? "عزل مفتوح" : "Isolation"}: {f.openIsolations}
                      </span>
                    )}
                    {f.openWarnings > 0 && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-400">
                        {ar ? "تحذير مفتوح" : "Warning"}: {f.openWarnings}
                      </span>
                    )}
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Fact({
  ok,
  label,
  detail,
  to,
}: {
  ok: boolean;
  label: string;
  detail?: string;
  to: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <Link to={to} className="inline-flex items-center gap-2 hover:underline">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <CircleDashed className="h-4 w-4 text-muted-foreground" />
        )}
        {label}
      </Link>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </li>
  );
}
