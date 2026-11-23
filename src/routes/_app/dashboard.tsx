import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useScopedStations, useStationScope } from "@/lib/station-scope";
import { useI18n } from "@/lib/i18n";
import { DailyGreeting } from "@/components/daily-greeting";
import { StationOfWeek } from "@/components/station-of-week";
import { StaffOfMonth } from "@/components/staff-of-month";

import {
  Building2,
  ClipboardList,
  AlertTriangle,
  Activity,
  FileText,
  Gauge,
  Sun,
  Moon,
  Flame,
  Zap,
  ListChecks,
  ClipboardCheck,
  TrendingUp,
  CalendarRange,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  SIZE_CLASS,
  WIDGET_SIZES,
  matchPreset,
  moveWidget,
  presetRange,
  updateWidget,
  useDashboardLayout,
  type DashboardLayout,
  type Density,
  type RangePreset,
  type WidgetId,
  type WidgetSize,
} from "@/lib/dashboard-layout";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const STATUS_COLORS: Record<string, string> = {
  in_service: "#10b981",
  standby: "#eab308",
  out_of_service: "#ef4444",
  maintenance: "#3b82f6",
  fixed_speed: "#f97316",
};
const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  in_service: { ar: "في الخدمة", en: "In Service" },
  standby: { ar: "احتياطي", en: "Standby" },
  out_of_service: { ar: "غير متاحة", en: "N/V" },
  maintenance: { ar: "صيانة", en: "Maintenance" },
  fixed_speed: { ar: "سرعة ثابتة", en: "Fixed Speed" },
};
const SEV_COLORS: Record<string, string> = {
  low: "#94a3b8",
  medium: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};
const SEV_LABELS: Record<string, { ar: string; en: string }> = {
  low: { ar: "منخفضة", en: "Low" },
  medium: { ar: "متوسطة", en: "Medium" },
  high: { ar: "عالية", en: "High" },
  critical: { ar: "حرجة", en: "Critical" },
};

function Dashboard() {
  const { profile, user } = useAuth();
  const { t, locale } = useI18n();
  const [from, setFrom] = useState(daysAgoISO(6));
  const [to, setTo] = useState(todayISO());
  const { scopedStationId, canPickStation } = useStationScope();
  const [stationFilter, setStationFilter] = useState<string>(scopedStationId ?? "all");

  const { data: stations } = useScopedStations();

  const stationEq = stationFilter === "all" ? undefined : stationFilter;

  const { data: kpis } = useQuery({
    queryKey: ["dash-kpis", from, to, stationEq ?? "all"],
    queryFn: async () => {
      const readingsQ = supabase
        .from("reading_entries")
        .select("id", { count: "exact", head: true })
        .gte("entry_date", from)
        .lte("entry_date", to);
      const reportsQ = supabase
        .from("shift_reports")
        .select("id", { count: "exact", head: true })
        .gte("report_date", from)
        .lte("report_date", to);
      const incidentsOpenQ = supabase
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");
      const incidentsAllQ = supabase
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .gte("occurred_at", `${from}T00:00:00`)
        .lte("occurred_at", `${to}T23:59:59`);
      if (stationEq) {
        readingsQ.eq("station_id", stationEq);
        reportsQ.eq("station_id", stationEq);
        incidentsOpenQ.eq("station_id", stationEq);
        incidentsAllQ.eq("station_id", stationEq);
      }
      const [r, rep, incO, incA, st] = await Promise.all([
        readingsQ,
        reportsQ,
        incidentsOpenQ,
        incidentsAllQ,
        supabase.from("stations").select("id", { count: "exact", head: true }).eq("active", true),
      ]);
      return {
        readings: r.count ?? 0,
        reports: rep.count ?? 0,
        openIncidents: incO.count ?? 0,
        totalIncidents: incA.count ?? 0,
        stations: st.count ?? 0,
      };
    },
  });

  const { data: readingsByDay } = useQuery({
    queryKey: ["dash-readings-day", from, to, stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("reading_entries")
        .select("entry_date")
        .gte("entry_date", from)
        .lte("entry_date", to);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      const buckets: Record<string, number> = {};
      for (const r of data ?? []) buckets[r.entry_date] = (buckets[r.entry_date] ?? 0) + 1;
      return Object.entries(buckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date: date.slice(5), count }));
    },
  });

  const { data: incidentsBySev } = useQuery({
    queryKey: ["dash-inc-sev", from, to, stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("incidents")
        .select("severity")
        .gte("occurred_at", `${from}T00:00:00`)
        .lte("occurred_at", `${to}T23:59:59`);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      const buckets: Record<string, number> = {};
      for (const i of data ?? []) buckets[i.severity] = (buckets[i.severity] ?? 0) + 1;
      return Object.entries(buckets).map(([name, value]) => ({ name, value }));
    },
  });

  // Availability status distribution — latest entry per station (within range).
  const { data: availability } = useQuery({
    queryKey: ["dash-availability", to, stationEq ?? "all"],
    queryFn: async () => {
      let entriesQ = supabase
        .from("equipment_availability_entries")
        .select("id, station_id, entry_date")
        .lte("entry_date", to)
        .order("entry_date", { ascending: false })
        .limit(200);
      if (stationEq) entriesQ = entriesQ.eq("station_id", stationEq);
      const { data: entries } = await entriesQ;
      // Pick latest entry per station
      const latestByStation = new Map<string, string>();
      for (const e of entries ?? []) {
        if (!latestByStation.has(e.station_id)) latestByStation.set(e.station_id, e.id);
      }
      const ids = Array.from(latestByStation.values());
      if (ids.length === 0) return { pie: [], mdr: [] };
      const { data: values } = await supabase
        .from("equipment_availability_values")
        .select("status, entry_id, equipment_id, remark, station_equipment!inner(station_id, code)")
        .in("entry_id", ids);
      const buckets: Record<string, number> = {};
      const perStation: Record<string, Record<string, number>> = {};
      for (const v of values ?? []) {
        buckets[v.status] = (buckets[v.status] ?? 0) + 1;
        const sid = (v as any).station_equipment.station_id as string;
        perStation[sid] ??= {};
        perStation[sid][v.status] = (perStation[sid][v.status] ?? 0) + 1;
      }
      const pie = Object.entries(buckets).map(([name, value]) => ({ name, value }));
      return { pie, perStation };
    },
  });

  const mdrRows = useMemo(() => {
    if (!stations || !availability?.perStation) return [];
    return stations
      .map((s: any) => {
        const p = availability.perStation[s.id] ?? {};
        const total = Object.values(p).reduce((a: number, b) => a + (b as number), 0);
        // Availability drops only for units that are actually out of service.
        const unavailable = (p.out_of_service ?? 0) + (p.not_available ?? 0) + (p.shutdown ?? 0);
        const avail = total ? ((total - unavailable) / total) * 100 : 0;
        return {
          id: s.id,
          code: s.code,
          name: locale === "ar" ? s.name_ar : s.name_en,
          ...p,
          total,
          avail,
        };
      })
      .filter((r: any) => r.total > 0);
  }, [stations, availability, locale]);

  const { data: reportsByDay } = useQuery({
    queryKey: ["dash-reports-day", from, to, stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("shift_reports")
        .select("report_date, shift")
        .gte("report_date", from)
        .lte("report_date", to);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      const buckets: Record<string, { date: string; day: number; night: number }> = {};
      for (const r of data ?? []) {
        buckets[r.report_date] ??= { date: r.report_date, day: 0, night: 0 };
        if (r.shift === "night") buckets[r.report_date].night += 1;
        else buckets[r.report_date].day += 1;
      }
      return Object.values(buckets)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ ...r, date: r.date.slice(5) }));
    },
  });

  const { data: recentReports } = useQuery({
    queryKey: ["recent-reports", stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("shift_reports")
        .select("id, report_date, shift, reported_by, created_at, stations(code, name_ar, name_en)")
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(6);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: recentIncidents } = useQuery({
    queryKey: ["recent-incidents", stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("incidents")
        .select("id, title, severity, status, occurred_at, equipment, stations(name_ar, name_en)")
        .order("occurred_at", { ascending: false })
        .limit(6);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: testsKpis } = useQuery({
    queryKey: ["dash-tests", from, to, stationEq ?? "all"],
    queryFn: async () => {
      const fpQ = supabase
        .from("fire_pump_tests")
        .select("id", { count: "exact", head: true })
        .gte("test_date", from)
        .lte("test_date", to);
      const gnQ = supabase
        .from("generator_tests")
        .select("id", { count: "exact", head: true })
        .gte("test_date", from)
        .lte("test_date", to);
      if (stationEq) {
        fpQ.eq("station_id", stationEq);
        gnQ.eq("station_id", stationEq);
      }
      const [fp, gn] = await Promise.all([fpQ, gnQ]);
      return { firePump: fp.count ?? 0, generator: gn.count ?? 0 };
    },
  });

  const { data: recentFirePump } = useQuery({
    queryKey: ["recent-firepump", stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("fire_pump_tests")
        .select("id, test_date, pump_tag, operator_name, stations(code, name_ar, name_en)")
        .order("test_date", { ascending: false })
        .limit(5);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: recentGenerator } = useQuery({
    queryKey: ["recent-generator", stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("generator_tests")
        .select("id, test_date, genset_tag, operator_name, stations(code, name_ar, name_en)")
        .order("test_date", { ascending: false })
        .limit(5);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      return data ?? [];
    },
  });
  const { data: routineStats } = useQuery({
    queryKey: ["dash-routine", from, to, stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("supervisor_routines")
        .select("routine_date, items")
        .gte("routine_date", from)
        .lte("routine_date", to);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      let done = 0,
        notDone = 0,
        pending = 0,
        total = 0;
      for (const row of data ?? []) {
        const items = (row.items ?? []) as { status?: string }[];
        for (const it of items) {
          total += 1;
          if (it.status === "done") done += 1;
          else if (it.status === "not_done") notDone += 1;
          else pending += 1;
        }
      }
      return {
        done,
        notDone,
        pending,
        total,
        pct: total ? Math.round((done / total) * 100) : 0,
        records: (data ?? []).length,
      };
    },
  });
  const { data: checklistStats } = useQuery({
    queryKey: ["dash-checklist", from, to, stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("checklist_reports")
        .select("completion_pct, remark_count")
        .gte("report_date", from)
        .lte("report_date", to);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      const rows = data ?? [];
      const remarks = rows.reduce((a, r) => a + (r.remark_count ?? 0), 0);
      const pct = rows.length
        ? Math.round(rows.reduce((a, r) => a + Number(r.completion_pct ?? 0), 0) / rows.length)
        : 0;
      return { count: rows.length, pct, remarks };
    },
  });

  const ar = locale === "ar";
  const { layout, save, reset } = useDashboardLayout(user?.id);
  const compact = layout.density === "compact";
  const activePreset = matchPreset(from, to);
  const fmt = useMemo(() => new Intl.NumberFormat(ar ? "ar-SA-u-nu-latn" : "en-US"), [ar]);
  const chartHeight = compact ? 200 : 260;

  const applyPreset = (p: RangePreset) => {
    const r = presetRange(p);
    setFrom(r.from);
    setTo(r.to);
  };

  const kpiGroups: { title: string; items: KpiItem[] }[] = [
    {
      title: ar ? "التشغيل" : "Operations",
      items: [
        {
          icon: ClipboardList,
          label: ar ? "القراءات" : "Readings",
          value: kpis?.readings,
          tone: "primary",
          to: "/readings",
        },
        {
          icon: FileText,
          label: ar ? "التقارير" : "Reports",
          value: kpis?.reports,
          tone: "info",
          to: "/reports",
        },
        {
          icon: Building2,
          label: ar ? "المحطات" : "Stations",
          value: kpis?.stations,
          tone: "success",
        },
      ],
    },
    {
      title: ar ? "السلامة" : "Safety",
      items: [
        {
          icon: AlertTriangle,
          label: ar ? "حوادث مفتوحة" : "Open incidents",
          value: kpis?.openIncidents,
          tone: (kpis?.openIncidents ?? 0) > 0 ? "danger" : "neutral",
          to: "/incidents",
        },
        {
          icon: Activity,
          label: ar ? "إجمالي الحوادث" : "Total incidents",
          value: kpis?.totalIncidents,
          tone: "warning",
          to: "/incidents",
        },
        {
          icon: Flame,
          label: ar ? "اختبارات مضخات الحريق" : "Fire pump tests",
          value: testsKpis?.firePump,
          tone: "neutral",
          to: "/firepump",
        },
        {
          icon: Zap,
          label: ar ? "اختبارات مولد الطوارئ" : "Generator tests",
          value: testsKpis?.generator,
          tone: "neutral",
          to: "/generator",
        },
      ],
    },
    {
      title: ar ? "قوائم الفحص" : "Checklists",
      items: [
        {
          icon: ListChecks,
          label: ar ? "قوائم مرسلة" : "Submitted",
          value: checklistStats?.count,
          tone: "primary",
          to: "/checklist",
        },
        {
          icon: ListChecks,
          label: ar ? "نسبة الالتزام" : "Compliance",
          value: checklistStats?.pct,
          suffix: "%",
          tone:
            (checklistStats?.pct ?? 0) >= 80
              ? "success"
              : (checklistStats?.pct ?? 0) >= 50
                ? "warning"
                : "danger",
          progress: checklistStats?.pct,
        },
        {
          icon: AlertTriangle,
          label: ar ? "ملاحظات" : "Remarks",
          value: checklistStats?.remarks,
          tone: "warning",
        },
      ],
    },
  ];

  const titles: Record<WidgetId, string> = {
    highlights: ar ? "محطة الأسبوع وموظف الشهر" : "Station of the week & staff of the month",
    kpis: ar ? "المؤشرات الرئيسية" : "Key indicators",
    routine: ar ? "روتين المشرفين" : "Supervisor's routine",
    readingsChart: ar ? "القراءات المدخلة يومياً" : "Readings per day",
    incidentsChart: ar ? "الحوادث حسب الخطورة" : "Incidents by severity",
    reportsChart: ar ? "التقارير اليومية للمشغلين" : "Daily operator reports",
    recentReports: ar ? "أحدث تقارير المشغلين" : "Recent operator reports",
    equipment: ar ? "توزيع حالة المعدات" : "Equipment status distribution",
    mdr: ar ? "التقرير الصباحي اليومي (MDR)" : "Morning Daily Report (MDR)",
    fireTests: ar ? "أحدث اختبارات مضخات الحريق" : "Recent fire pump tests",
    generatorTests: ar ? "أحدث اختبارات مولد الطوارئ" : "Recent generator tests",
    recentIncidents: t("dash.recent_incidents"),
  };

  const axisProps = {
    fontSize: 11,
    tickLine: false,
    axisLine: false,
    stroke: "var(--muted-foreground)",
  } as const;
  const tooltipStyle = {
    contentStyle: {
      background: "var(--popover)",
      color: "var(--popover-foreground)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      fontSize: 12,
    },
    cursor: { fill: "var(--muted)", opacity: 0.5 },
  } as const;
  const noData = (
    <EmptyState text={ar ? "لا توجد بيانات في هذه الفترة" : "No data in this period"} />
  );

  const renderWidget = (id: WidgetId): React.ReactNode => {
    switch (id) {
      case "highlights":
        return (
          <div className="grid gap-2 lg:grid-cols-3">
            <StationOfWeek />
            <StaffOfMonth />
          </div>
        );
      case "kpis":
        return (
          <div className={`grid gap-4 ${compact ? "lg:gap-3" : ""} lg:grid-cols-3`}>
            {kpiGroups.map((g) => (
              <section key={g.title} aria-label={g.title} className="rounded-xl border bg-card">
                <h3 className="border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.title}
                </h3>
                <div className="grid grid-cols-2 gap-1 p-1">
                  {g.items.map((k) => (
                    <KpiTile key={k.label} item={k} fmt={fmt} compact={compact} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        );
      case "routine":
        return (
          <Panel
            title={titles.routine}
            icon={ClipboardCheck}
            link={{ to: "/routine", label: ar ? "عرض" : "Open" }}
            compact={compact}
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MiniStat
                label={ar ? "إجمالي المهام" : "Total tasks"}
                value={fmt.format(routineStats?.total ?? 0)}
              />
              <MiniStat
                label={ar ? "منجزة" : "Done"}
                value={fmt.format(routineStats?.done ?? 0)}
                className="text-emerald-600 dark:text-emerald-400"
              />
              <MiniStat
                label={ar ? "غير منجزة" : "Not done"}
                value={fmt.format(routineStats?.notDone ?? 0)}
                className="text-destructive"
              />
              <MiniStat
                label={ar ? "نسبة الإكمال" : "Completion"}
                value={`${fmt.format(routineStats?.pct ?? 0)}%`}
                className="text-primary"
              />
            </div>
            <div
              className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={routineStats?.pct ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={ar ? "نسبة الإكمال" : "Completion"}
            >
              <div
                className="h-full bg-primary transition-[width] motion-reduce:transition-none"
                style={{ width: `${routineStats?.pct ?? 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {ar
                ? `عدد السجلات: ${routineStats?.records ?? 0} — غير محدد: ${routineStats?.pending ?? 0}`
                : `Records: ${routineStats?.records ?? 0} — Unmarked: ${routineStats?.pending ?? 0}`}
            </p>
          </Panel>
        );
      case "readingsChart":
        return (
          <Panel
            title={titles.readingsChart}
            icon={TrendingUp}
            link={{ to: "/readings", label: ar ? "عرض" : "Open" }}
            compact={compact}
          >
            {(readingsByDay ?? []).length === 0 ? (
              noData
            ) : (
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={readingsByDay ?? []}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" {...axisProps} reversed={ar} />
                  <YAxis
                    {...axisProps}
                    allowDecimals={false}
                    orientation={ar ? "right" : "left"}
                    width={36}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Bar
                    dataKey="count"
                    name={ar ? "القراءات" : "Readings"}
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>
        );
      case "incidentsChart":
        return (
          <Panel
            title={titles.incidentsChart}
            icon={AlertTriangle}
            link={{ to: "/incidents", label: ar ? "عرض" : "Open" }}
            compact={compact}
          >
            {(incidentsBySev ?? []).length === 0 ? (
              noData
            ) : (
              <ResponsiveContainer width="100%" height={chartHeight}>
                <PieChart>
                  <Pie
                    data={incidentsBySev ?? []}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {(incidentsBySev ?? []).map((e, i) => (
                      <Cell key={i} fill={SEV_COLORS[e.name] ?? "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: any, n: any) => [v, SEV_LABELS[n]?.[locale] ?? n]}
                  />
                  <Legend formatter={(n: any) => SEV_LABELS[n]?.[locale] ?? n} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Panel>
        );
      case "reportsChart":
        return (
          <Panel
            title={titles.reportsChart}
            icon={FileText}
            link={{ to: "/reports", label: ar ? "عرض" : "Open" }}
            compact={compact}
          >
            {(reportsByDay ?? []).length === 0 ? (
              noData
            ) : (
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={reportsByDay ?? []}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" {...axisProps} reversed={ar} />
                  <YAxis
                    {...axisProps}
                    allowDecimals={false}
                    orientation={ar ? "right" : "left"}
                    width={36}
                  />
                  <Tooltip {...tooltipStyle} />
                  <Legend iconType="circle" />
                  <Bar
                    dataKey="day"
                    name={ar ? "نهاري" : "Day"}
                    stackId="a"
                    fill="#f59e0b"
                    maxBarSize={36}
                  />
                  <Bar
                    dataKey="night"
                    name={ar ? "ليلي" : "Night"}
                    stackId="a"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Panel>
        );
      case "recentReports":
        return (
          <Panel
            title={titles.recentReports}
            icon={FileText}
            link={{ to: "/reports", label: ar ? "عرض الكل" : "View all" }}
            compact={compact}
          >
            {!recentReports || recentReports.length === 0 ? (
              <EmptyState text={ar ? "لا توجد تقارير" : "No reports"} />
            ) : (
              <ul className="divide-y">
                {recentReports.slice(0, 6).map((r: any) => (
                  <li
                    key={r.id}
                    className={`flex items-center gap-3 ${compact ? "py-1.5" : "py-2.5"}`}
                  >
                    {r.shift === "night" ? (
                      <Moon className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                    ) : (
                      <Sun className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {r.stations ? (ar ? r.stations.name_ar : r.stations.name_en) : ""}
                        {r.stations?.code ? ` · ${r.stations.code}` : ""}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.report_date} · {r.reported_by ?? (ar ? "غير محدد" : "—")}
                      </div>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {r.shift === "night" ? (ar ? "ليلي" : "Night") : ar ? "نهاري" : "Day"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );
      case "equipment": {
        const pieData = availability?.pie ?? [];
        const totalUnits = pieData.reduce((a: number, b: any) => a + (b.value as number), 0);
        return (
          <Panel
            title={titles.equipment}
            icon={Gauge}
            link={{ to: "/availability", label: ar ? "عرض" : "Open" }}
            compact={compact}
          >
            {pieData.length === 0 ? (
              noData
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <ResponsiveContainer width="100%" height={compact ? 170 : 200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="62%"
                        outerRadius="90%"
                        paddingAngle={2}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {pieData.map((e: any, i: number) => (
                          <Cell key={i} fill={STATUS_COLORS[e.name] ?? "#64748b"} />
                        ))}
                      </Pie>
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(v: any, n: any) => [v, STATUS_LABELS[n]?.[locale] ?? n]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold">{fmt.format(totalUnits)}</span>
                    <span className="text-xs text-muted-foreground">
                      {ar ? "إجمالي الوحدات" : "Total units"}
                    </span>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {pieData
                    .slice()
                    .sort((a: any, b: any) => b.value - a.value)
                    .map((e: any) => (
                      <li key={e.name} className="flex items-center gap-2 text-sm">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: STATUS_COLORS[e.name] ?? "#64748b" }}
                        />
                        <span className="truncate">
                          {STATUS_LABELS[e.name]?.[locale] ?? e.name}
                        </span>
                        <span className="ms-auto font-semibold tabular-nums">
                          {fmt.format(e.value)}
                        </span>
                        <span className="w-12 text-end text-xs tabular-nums text-muted-foreground">
                          {totalUnits ? Math.round((e.value / totalUnits) * 100) : 0}%
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </Panel>
        );
      }
      case "mdr":
        return (
          <Panel
            title={titles.mdr}
            icon={Gauge}
            link={{ to: "/availability", label: ar ? "عرض" : "Open" }}
            compact={compact}
            flush
          >
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-start font-medium">
                      {ar ? "المحطة" : "Station"}
                    </th>
                    {(
                      [
                        "in_service",
                        "standby",
                        "out_of_service",
                        "maintenance",
                        "fixed_speed",
                      ] as const
                    ).map((k) => (
                      <th key={k} scope="col" className="whitespace-nowrap px-2 py-2 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: STATUS_COLORS[k] ?? "#64748b" }}
                          />
                          {STATUS_LABELS[k]?.[locale] ?? k}
                        </span>
                      </th>
                    ))}
                    <th scope="col" className="px-2 py-2 font-medium">
                      {ar ? "الإجمالي" : "Total"}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {ar ? "التواجدية %" : "Avail %"}
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {mdrRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-muted-foreground">
                        {ar ? "لا توجد بيانات" : "No data"}
                      </td>
                    </tr>
                  ) : (
                    mdrRows.map((r: any) => (
                      <tr key={r.id} className="border-t hover:bg-muted/40">
                        <th
                          scope="row"
                          className={`px-3 text-start font-medium ${compact ? "py-1" : "py-2"}`}
                        >
                          {r.code}
                        </th>
                        <td className="text-center">{r.in_service ?? 0}</td>
                        <td className="text-center">{r.standby ?? 0}</td>
                        <td className="text-center">{r.out_of_service ?? 0}</td>
                        <td className="text-center">{r.maintenance ?? 0}</td>
                        <td className="text-center">{r.fixed_speed ?? 0}</td>
                        <td className="text-center font-semibold">{r.total}</td>
                        <td className="px-3 text-center">
                          <span
                            className={`inline-block min-w-12 rounded-full px-2 py-0.5 text-xs font-bold ${
                              r.avail >= 80
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : r.avail >= 50
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                  : "bg-destructive/15 text-destructive"
                            }`}
                          >
                            {r.avail.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      case "fireTests":
        return (
          <TestListCard
            icon={Flame}
            iconClass="text-rose-600"
            title={titles.fireTests}
            linkTo="/firepump"
            viewAll={ar ? "عرض الكل" : "View all"}
            empty={ar ? "لا توجد اختبارات" : "No tests"}
            compact={compact}
            rows={(recentFirePump ?? []).map((r: any) => ({
              id: r.id,
              date: r.test_date,
              tag: r.pump_tag,
              who: r.operator_name,
              station: r.stations
                ? `${r.stations.code} · ${ar ? r.stations.name_ar : r.stations.name_en}`
                : "",
            }))}
          />
        );
      case "generatorTests":
        return (
          <TestListCard
            icon={Zap}
            iconClass="text-amber-600"
            title={titles.generatorTests}
            linkTo="/generator"
            viewAll={ar ? "عرض الكل" : "View all"}
            empty={ar ? "لا توجد اختبارات" : "No tests"}
            compact={compact}
            rows={(recentGenerator ?? []).map((r: any) => ({
              id: r.id,
              date: r.test_date,
              tag: r.genset_tag,
              who: r.operator_name,
              station: r.stations
                ? `${r.stations.code} · ${ar ? r.stations.name_ar : r.stations.name_en}`
                : "",
            }))}
          />
        );
      case "recentIncidents":
        return (
          <Panel
            title={titles.recentIncidents}
            icon={Activity}
            link={{ to: "/incidents", label: ar ? "عرض الكل" : "View all" }}
            compact={compact}
          >
            {!recentIncidents || recentIncidents.length === 0 ? (
              <EmptyState text={ar ? "لا توجد حوادث" : "No incidents"} />
            ) : (
              <ul className="divide-y">
                {recentIncidents.slice(0, 6).map((inc: any) => (
                  <li
                    key={inc.id}
                    className={`flex items-center gap-3 ${compact ? "py-1.5" : "py-3"}`}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: SEV_COLORS[inc.severity] ?? "#64748b" }}
                      title={SEV_LABELS[inc.severity]?.[locale] ?? inc.severity}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{inc.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {inc.equipment} ·{" "}
                        {inc.stations ? (ar ? inc.stations.name_ar : inc.stations.name_en) : ""}
                      </div>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{inc.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );
    }
  };

  const visible = layout.widgets.filter((w) => w.visible);

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <DailyGreeting name={profile?.full_name} />

      {/* Toolbar: sticky so filters stay reachable while scrolling a long dashboard. */}
      <div className="sticky top-0 z-20 -mx-4 border-b bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold md:text-2xl">
              {t("dash.welcome")} {profile?.full_name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("dash.title")} · {from === to ? from : `${from} → ${to}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label={ar ? "الفترة" : "Period"}
              className="inline-flex rounded-lg border bg-card p-0.5"
            >
              {(
                [
                  ["today", ar ? "اليوم" : "Today"],
                  ["7d", ar ? "7 أيام" : "7 days"],
                  ["30d", ar ? "30 يوم" : "30 days"],
                  ["month", ar ? "هذا الشهر" : "This month"],
                ] as [RangePreset, string][]
              ).map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  aria-pressed={activePreset === p}
                  className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    activePreset === p
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={activePreset ? "outline" : "default"}
                  size="sm"
                  className="min-h-9 gap-2"
                >
                  <CalendarRange className="h-4 w-4" aria-hidden />
                  {ar ? "مخصص" : "Custom"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 space-y-3">
                <label className="block text-xs text-muted-foreground">
                  {ar ? "من" : "From"}
                  <input
                    type="date"
                    value={from}
                    max={to}
                    onChange={(e) => setFrom(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                  />
                </label>
                <label className="block text-xs text-muted-foreground">
                  {ar ? "إلى" : "To"}
                  <input
                    type="date"
                    value={to}
                    min={from}
                    onChange={(e) => setTo(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                  />
                </label>
              </PopoverContent>
            </Popover>
            <label className="sr-only" htmlFor="dash-station">
              {ar ? "المحطة" : "Station"}
            </label>
            <select
              id="dash-station"
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              disabled={!canPickStation}
              className="h-9 rounded-md border bg-card px-2 text-sm disabled:opacity-70"
            >
              {canPickStation && <option value="all">{ar ? "كل المحطات" : "All stations"}</option>}
              {stations?.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {ar ? s.name_ar : s.name_en}
                </option>
              ))}
            </select>
            <CustomizeSheet
              ar={ar}
              layout={layout}
              titles={titles}
              onChange={save}
              onReset={reset}
            />
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          text={
            ar
              ? "كل الأقسام مخفية. افتح «تخصيص» لإظهارها."
              : "All sections are hidden. Open “Customize” to show them."
          }
        />
      ) : (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 ${compact ? "gap-3" : "gap-4"}`}
        >
          {visible.map((w) => (
            <div
              key={w.id}
              className={`min-w-0 ${w.size === "third" ? "" : "md:col-span-2"} ${SIZE_CLASS[w.size]}`}
            >
              {renderWidget(w.id)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Tone = "primary" | "info" | "success" | "warning" | "danger" | "neutral";
const TONE: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

interface KpiItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  suffix?: string;
  tone: Tone;
  to?: string;
  progress?: number;
}

function KpiTile({
  item,
  fmt,
  compact,
}: {
  item: KpiItem;
  fmt: Intl.NumberFormat;
  compact: boolean;
}) {
  const Icon = item.icon;
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONE[item.tone]}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
          {item.label}
        </span>
      </div>
      <div
        className={`mt-2 font-bold tabular-nums leading-none ${compact ? "text-xl" : "text-2xl"}`}
      >
        {item.value === undefined ? (
          <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        ) : (
          `${fmt.format(item.value)}${item.suffix ?? ""}`
        )}
      </div>
      {item.progress !== undefined ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-current opacity-70"
            style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
          />
        </div>
      ) : null}
    </>
  );
  const cls = `block rounded-lg ${compact ? "p-2.5" : "p-3"}`;
  return item.to ? (
    <Link
      to={item.to}
      className={`${cls} transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
    >
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function MiniStat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${className}`}>{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <Inbox className="h-8 w-8 opacity-50" aria-hidden />
      {text}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  link,
  compact,
  flush,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  link?: { to: string; label: string };
  compact: boolean;
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex h-full flex-col overflow-hidden rounded-xl border bg-card"
      aria-label={title}
    >
      <header
        className={`flex items-center justify-between gap-2 border-b ${compact ? "px-3 py-2" : "px-4 py-3"}`}
      >
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{title}</span>
        </h3>
        {link ? (
          <Link
            to={link.to}
            className="shrink-0 rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {link.label}
          </Link>
        ) : null}
      </header>
      <div className={`flex-1 ${flush ? "" : compact ? "p-3" : "p-4"}`}>{children}</div>
    </section>
  );
}

const SIZE_LABEL: Record<WidgetSize, { ar: string; en: string }> = {
  full: { ar: "كامل", en: "Full" },
  half: { ar: "نصف", en: "Half" },
  third: { ar: "ثلث", en: "Third" },
  twoThirds: { ar: "ثلثين", en: "Two thirds" },
};

function CustomizeSheet({
  ar,
  layout,
  titles,
  onChange,
  onReset,
}: {
  ar: boolean;
  layout: DashboardLayout;
  titles: Record<WidgetId, string>;
  onChange: (l: DashboardLayout) => void;
  onReset: () => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-9 gap-2">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {ar ? "تخصيص" : "Customize"}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={ar ? "left" : "right"}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        dir={ar ? "rtl" : "ltr"}
      >
        <SheetHeader className="border-b p-4 text-start">
          <SheetTitle>{ar ? "تخصيص لوحة التحكم" : "Customize dashboard"}</SheetTitle>
          <SheetDescription>
            {ar
              ? "اختر الأقسام وترتيبها وعرضها. يُحفظ على هذا الجهاز لحسابك."
              : "Pick sections, their order and width. Saved on this device for your account."}
          </SheetDescription>
        </SheetHeader>
        <div className="border-b p-4">
          <p className="mb-2 text-sm font-medium">{ar ? "الكثافة" : "Density"}</p>
          <div role="radiogroup" className="inline-flex rounded-lg border p-0.5">
            {(["comfortable", "compact"] as Density[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={layout.density === d}
                onClick={() => onChange({ ...layout, density: d })}
                className={`min-h-9 rounded-md px-3 text-sm ${layout.density === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {d === "comfortable" ? (ar ? "مريح" : "Comfortable") : ar ? "مضغوط" : "Compact"}
              </button>
            ))}
          </div>
        </div>
        <ol className="flex-1 divide-y overflow-y-auto">
          {layout.widgets.map((w, i) => (
            <li
              key={w.id}
              className={`flex items-center gap-2 px-4 py-2.5 ${w.visible ? "" : "opacity-60"}`}
            >
              {/* Switch thumb assumes LTR; keep it LTR so it stays inside the track in Arabic. */}
              <span dir="ltr" className="inline-flex">
                <Switch
                  checked={w.visible}
                  onCheckedChange={(v) => onChange(updateWidget(layout, w.id, { visible: v }))}
                  aria-label={`${ar ? "إظهار" : "Show"} ${titles[w.id]}`}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{titles[w.id]}</span>
              {WIDGET_SIZES[w.id].length > 1 ? (
                <select
                  value={w.size}
                  onChange={(e) =>
                    onChange(updateWidget(layout, w.id, { size: e.target.value as WidgetSize }))
                  }
                  aria-label={`${ar ? "عرض" : "Width of"} ${titles[w.id]}`}
                  className="h-8 rounded-md border bg-background px-1.5 text-xs"
                >
                  {WIDGET_SIZES[w.id].map((s) => (
                    <option key={s} value={s}>
                      {SIZE_LABEL[s][ar ? "ar" : "en"]}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="flex">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={i === 0}
                  onClick={() => onChange(moveWidget(layout, w.id, -1))}
                  aria-label={`${ar ? "تحريك للأعلى" : "Move up"}: ${titles[w.id]}`}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={i === layout.widgets.length - 1}
                  onClick={() => onChange(moveWidget(layout, w.id, 1))}
                  aria-label={`${ar ? "تحريك للأسفل" : "Move down"}: ${titles[w.id]}`}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <div className="border-t p-4">
          <Button variant="outline" className="w-full gap-2" onClick={onReset}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            {ar ? "استعادة الترتيب الافتراضي" : "Restore default layout"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TestListCard({
  icon: Icon,
  iconClass,
  title,
  linkTo,
  viewAll,
  empty,
  rows,
  compact = false,
}: {
  compact?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  linkTo: string;
  viewAll: string;
  empty: string;
  rows: { id: string; date: string; tag?: string | null; who?: string | null; station: string }[];
}) {
  return (
    <section
      className="flex h-full flex-col overflow-hidden rounded-xl border bg-card"
      aria-label={title}
    >
      <header
        className={`flex items-center justify-between gap-2 border-b ${compact ? "px-3 py-2" : "px-4 py-3"}`}
      >
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
          <span className="truncate">{title}</span>
        </h3>
        <Link to={linkTo} className="shrink-0 text-xs font-medium text-primary hover:underline">
          {viewAll}
        </Link>
      </header>
      <div className={compact ? "p-3" : "p-4"}>
        {rows.length === 0 ? (
          <EmptyState text={empty} />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className={`flex items-center gap-3 ${compact ? "py-1.5" : "py-2.5"}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.station || "—"}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.date}
                    {r.who ? ` · ${r.who}` : ""}
                  </div>
                </div>
                {r.tag ? (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">
                    {r.tag}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
