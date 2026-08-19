import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useScopedStations, useStationScope } from "@/lib/station-scope";
import { useI18n } from "@/lib/i18n";
import { DailyGreeting } from "@/components/daily-greeting";

import {
  Building2, ClipboardList, AlertTriangle, Activity, FileText, Gauge, Sun, Moon, Flame, Zap,
} from "lucide-react";

import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
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
  low: "#94a3b8", medium: "#eab308", high: "#f97316", critical: "#ef4444",
};

function Dashboard() {
  const { profile } = useAuth();
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
      const readingsQ = supabase.from("reading_entries").select("id", { count: "exact", head: true })
        .gte("entry_date", from).lte("entry_date", to);
      const reportsQ = supabase.from("shift_reports").select("id", { count: "exact", head: true })
        .gte("report_date", from).lte("report_date", to);
      const incidentsOpenQ = supabase.from("incidents").select("id", { count: "exact", head: true }).eq("status", "open");
      const incidentsAllQ = supabase.from("incidents").select("id", { count: "exact", head: true })
        .gte("occurred_at", `${from}T00:00:00`).lte("occurred_at", `${to}T23:59:59`);
      if (stationEq) {
        readingsQ.eq("station_id", stationEq);
        reportsQ.eq("station_id", stationEq);
        incidentsOpenQ.eq("station_id", stationEq);
        incidentsAllQ.eq("station_id", stationEq);
      }
      const [r, rep, incO, incA, st] = await Promise.all([
        readingsQ, reportsQ, incidentsOpenQ, incidentsAllQ,
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
      let q = supabase.from("reading_entries").select("entry_date")
        .gte("entry_date", from).lte("entry_date", to);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      const buckets: Record<string, number> = {};
      for (const r of data ?? []) buckets[r.entry_date] = (buckets[r.entry_date] ?? 0) + 1;
      return Object.entries(buckets).sort(([a],[b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date: date.slice(5), count }));
    },
  });

  const { data: incidentsBySev } = useQuery({
    queryKey: ["dash-inc-sev", from, to, stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase.from("incidents").select("severity")
        .gte("occurred_at", `${from}T00:00:00`).lte("occurred_at", `${to}T23:59:59`);
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
      let entriesQ = supabase.from("equipment_availability_entries")
        .select("id, station_id, entry_date").lte("entry_date", to)
        .order("entry_date", { ascending: false }).limit(200);
      if (stationEq) entriesQ = entriesQ.eq("station_id", stationEq);
      const { data: entries } = await entriesQ;
      // Pick latest entry per station
      const latestByStation = new Map<string, string>();
      for (const e of entries ?? []) {
        if (!latestByStation.has(e.station_id)) latestByStation.set(e.station_id, e.id);
      }
      const ids = Array.from(latestByStation.values());
      if (ids.length === 0) return { pie: [], mdr: [] };
      const { data: values } = await supabase.from("equipment_availability_values")
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
    return stations.map((s: any) => {
      const p = availability.perStation[s.id] ?? {};
      const total = Object.values(p).reduce((a: number, b) => a + (b as number), 0);
      const inSvc = p.in_service ?? 0;
      const avail = total ? (inSvc / total) * 100 : 0;
      return { id: s.id, code: s.code, name: locale === "ar" ? s.name_ar : s.name_en, ...p, total, avail };
    }).filter((r: any) => r.total > 0);
  }, [stations, availability, locale]);

  const { data: reportsByDay } = useQuery({
    queryKey: ["dash-reports-day", from, to, stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase.from("shift_reports").select("report_date, shift")
        .gte("report_date", from).lte("report_date", to);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      const buckets: Record<string, { date: string; day: number; night: number }> = {};
      for (const r of data ?? []) {
        buckets[r.report_date] ??= { date: r.report_date, day: 0, night: 0 };
        if (r.shift === "night") buckets[r.report_date].night += 1;
        else buckets[r.report_date].day += 1;
      }
      return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ ...r, date: r.date.slice(5) }));
    },
  });

  const { data: recentReports } = useQuery({
    queryKey: ["recent-reports", stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase.from("shift_reports")
        .select("id, report_date, shift, reported_by, created_at, stations(code, name_ar, name_en)")
        .order("report_date", { ascending: false }).order("created_at", { ascending: false }).limit(6);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: recentIncidents } = useQuery({
    queryKey: ["recent-incidents", stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase.from("incidents")
        .select("id, title, severity, status, occurred_at, equipment, stations(name_ar, name_en)")
        .order("occurred_at", { ascending: false }).limit(6);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: testsKpis } = useQuery({
    queryKey: ["dash-tests", from, to, stationEq ?? "all"],
    queryFn: async () => {
      const fpQ = supabase.from("fire_pump_tests").select("id", { count: "exact", head: true })
        .gte("test_date", from).lte("test_date", to);
      const gnQ = supabase.from("generator_tests").select("id", { count: "exact", head: true })
        .gte("test_date", from).lte("test_date", to);
      if (stationEq) { fpQ.eq("station_id", stationEq); gnQ.eq("station_id", stationEq); }
      const [fp, gn] = await Promise.all([fpQ, gnQ]);
      return { firePump: fp.count ?? 0, generator: gn.count ?? 0 };
    },
  });

  const { data: recentFirePump } = useQuery({
    queryKey: ["recent-firepump", stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase.from("fire_pump_tests")
        .select("id, test_date, pump_tag, operator_name, stations(code, name_ar, name_en)")
        .order("test_date", { ascending: false }).limit(5);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: recentGenerator } = useQuery({
    queryKey: ["recent-generator", stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase.from("generator_tests")
        .select("id, test_date, genset_tag, operator_name, stations(code, name_ar, name_en)")
        .order("test_date", { ascending: false }).limit(5);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      return data ?? [];
    },
  });
  const { data: routineStats } = useQuery({
    queryKey: ["dash-routine", from, to, stationEq ?? "all"],
    queryFn: async () => {
      let q = supabase.from("supervisor_routines")
        .select("routine_date, items")
        .gte("routine_date", from).lte("routine_date", to);
      if (stationEq) q = q.eq("station_id", stationEq);
      const { data } = await q;
      let done = 0, notDone = 0, pending = 0, total = 0;
      for (const row of data ?? []) {
        const items = (row.items ?? []) as { status?: string }[];
        for (const it of items) {
          total += 1;
          if (it.status === "done") done += 1;
          else if (it.status === "not_done") notDone += 1;
          else pending += 1;
        }
      }
      return { done, notDone, pending, total, pct: total ? Math.round((done / total) * 100) : 0, records: (data ?? []).length };
    },
  });



  return (
    <div className="space-y-6">
      <DailyGreeting name={profile?.full_name} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("dash.welcome")} {profile?.full_name}</h1>
          <p className="text-sm text-muted-foreground">{t("dash.title")}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground block">{locale === "ar" ? "من" : "From"}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="h-9 px-2 rounded-md border bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block">{locale === "ar" ? "إلى" : "To"}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="h-9 px-2 rounded-md border bg-background text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block">{locale === "ar" ? "المحطة" : "Station"}</label>
            <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)} disabled={!canPickStation}
              className="h-9 px-2 rounded-md border bg-background text-sm disabled:opacity-70">
              {canPickStation && <option value="all">{locale === "ar" ? "الكل" : "All"}</option>}
              {stations?.map((s: any) => (
                <option key={s.id} value={s.id}>{s.code}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={ClipboardList} label={locale === "ar" ? "القراءات" : "Readings"} value={kpis?.readings ?? 0} color="text-primary bg-primary/10" />
        <StatCard icon={FileText} label={locale === "ar" ? "التقارير" : "Reports"} value={kpis?.reports ?? 0} color="text-blue-600 bg-blue-100" />
        <StatCard icon={AlertTriangle} label={locale === "ar" ? "حوادث مفتوحة" : "Open Incidents"} value={kpis?.openIncidents ?? 0} color="text-red-600 bg-red-100" />
        <StatCard icon={Activity} label={locale === "ar" ? "إجمالي الحوادث" : "Total Incidents"} value={kpis?.totalIncidents ?? 0} color="text-orange-600 bg-orange-100" />
        <StatCard icon={Building2} label={locale === "ar" ? "المحطات" : "Stations"} value={kpis?.stations ?? 0} color="text-emerald-600 bg-emerald-100" />
        <StatCard icon={Flame} label={locale === "ar" ? "اختبارات مضخات الحريق" : "Fire Pump Tests"} value={testsKpis?.firePump ?? 0} color="text-rose-600 bg-rose-100" />
        <StatCard icon={Zap} label={locale === "ar" ? "اختبارات مولد الطوارئ" : "Generator Tests"} value={testsKpis?.generator ?? 0} color="text-amber-600 bg-amber-100" />
      </div>


      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={locale === "ar" ? "القراءات المدخلة يومياً" : "Readings per day"}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={readingsByDay ?? []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={locale === "ar" ? "الحوادث حسب الخطورة" : "Incidents by severity"}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={incidentsBySev ?? []} dataKey="value" nameKey="name" outerRadius={90} label>
                {(incidentsBySev ?? []).map((e, i) => (
                  <Cell key={i} fill={SEV_COLORS[e.name] ?? "#64748b"} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {locale === "ar" ? "روتين المشرفين" : "Supervisor's routine"}
          </h3>
          <Link to="/routine" className="text-sm text-primary hover:underline">
            {locale === "ar" ? "عرض" : "Open"}
          </Link>
        </div>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{locale === "ar" ? "إجمالي المهام" : "Total tasks"}</p>
            <p className="text-2xl font-bold">{routineStats?.total ?? 0}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{locale === "ar" ? "منجزة" : "Done"}</p>
            <p className="text-2xl font-bold text-emerald-600">{routineStats?.done ?? 0}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{locale === "ar" ? "غير منجزة" : "Not done"}</p>
            <p className="text-2xl font-bold text-destructive">{routineStats?.notDone ?? 0}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{locale === "ar" ? "نسبة الإكمال" : "Completion"}</p>
            <p className="text-2xl font-bold text-primary">{routineStats?.pct ?? 0}%</p>
          </div>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${routineStats?.pct ?? 0}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {locale === "ar"
            ? `عدد السجلات: ${routineStats?.records ?? 0} — غير محدد: ${routineStats?.pending ?? 0}`
            : `Records: ${routineStats?.records ?? 0} — Unmarked: ${routineStats?.pending ?? 0}`}
        </p>
      </div>



      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={locale === "ar" ? "التقارير اليومية للمشغلين" : "Daily operator reports"}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={reportsByDay ?? []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="day" name={locale === "ar" ? "نهاري" : "Day"} stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
              <Bar dataKey="night" name={locale === "ar" ? "ليلي" : "Night"} stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {locale === "ar" ? "أحدث تقارير المشغلين" : "Recent operator reports"}
            </h3>
            <Link to="/reports" className="text-sm text-primary hover:underline">
              {locale === "ar" ? "عرض الكل" : "View all"}
            </Link>
          </div>
          {!recentReports || recentReports.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {locale === "ar" ? "لا توجد تقارير" : "No reports"}
            </p>
          ) : (
            <ul className="divide-y">
              {recentReports.map((r: any) => (
                <li key={r.id} className="py-2.5 flex items-center gap-3">
                  {r.shift === "night"
                    ? <Moon className="h-4 w-4 text-indigo-500 shrink-0" />
                    : <Sun className="h-4 w-4 text-amber-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">
                      {r.stations ? (locale === "ar" ? r.stations.name_ar : r.stations.name_en) : ""}
                      {r.stations?.code ? ` · ${r.stations.code}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.report_date} · {r.reported_by ?? (locale === "ar" ? "غير محدد" : "—")}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-muted">
                    {r.shift === "night" ? (locale === "ar" ? "ليلي" : "Night") : (locale === "ar" ? "نهاري" : "Day")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title={locale === "ar" ? "توزيع حالة المعدات" : "Equipment status distribution"}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={availability?.pie ?? []} dataKey="value" nameKey="name" outerRadius={90}
                label={(e: any) => `${STATUS_LABELS[e.name]?.[locale] ?? e.name}: ${e.value}`}>
                {(availability?.pie ?? []).map((e, i) => (
                  <Cell key={i} fill={STATUS_COLORS[e.name] ?? "#64748b"} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any, n: any) => [v, STATUS_LABELS[n]?.[locale] ?? n]} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="lg:col-span-2 rounded-xl border bg-card p-4 overflow-hidden">
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            {locale === "ar" ? "التقرير الصباحي اليومي (MDR)" : "Morning Daily Report (MDR)"}
          </h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-start px-2 py-2">{locale === "ar" ? "المحطة" : "Station"}</th>
                  <th className="px-2 py-2" title="In Service">🟢</th>
                  <th className="px-2 py-2" title="Standby">🟡</th>
                  <th className="px-2 py-2" title="N/V">🔴</th>
                  <th className="px-2 py-2" title="Maintenance">🔵</th>
                  <th className="px-2 py-2" title="Fixed Speed">🟠</th>
                  <th className="px-2 py-2">{locale === "ar" ? "الإجمالي" : "Total"}</th>
                  <th className="px-2 py-2">{locale === "ar" ? "التواجدية %" : "Avail %"}</th>
                </tr>
              </thead>
              <tbody>
                {mdrRows.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">
                    {locale === "ar" ? "لا توجد بيانات" : "No data"}
                  </td></tr>
                ) : mdrRows.map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-1.5 font-medium">{r.code}</td>
                    <td className="text-center">{r.in_service ?? 0}</td>
                    <td className="text-center">{r.standby ?? 0}</td>
                    <td className="text-center">{r.out_of_service ?? 0}</td>
                    <td className="text-center">{r.maintenance ?? 0}</td>
                    <td className="text-center">{r.fixed_speed ?? 0}</td>
                    <td className="text-center font-semibold">{r.total}</td>
                    <td className="text-center">
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        r.avail >= 80 ? "bg-emerald-100 text-emerald-800" :
                        r.avail >= 50 ? "bg-yellow-100 text-yellow-800" :
                        "bg-red-100 text-red-800"
                      }`}>{r.avail.toFixed(0)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TestListCard
          icon={Flame}
          iconClass="text-rose-600"
          title={locale === "ar" ? "أحدث اختبارات مضخات الحريق" : "Recent fire pump tests"}
          linkTo="/firepump"
          viewAll={locale === "ar" ? "عرض الكل" : "View all"}
          empty={locale === "ar" ? "لا توجد اختبارات" : "No tests"}
          rows={(recentFirePump ?? []).map((r: any) => ({
            id: r.id,
            date: r.test_date,
            tag: r.pump_tag,
            who: r.operator_name,
            station: r.stations ? `${r.stations.code} · ${locale === "ar" ? r.stations.name_ar : r.stations.name_en}` : "",
          }))}
        />
        <TestListCard
          icon={Zap}
          iconClass="text-amber-600"
          title={locale === "ar" ? "أحدث اختبارات مولد الطوارئ" : "Recent generator tests"}
          linkTo="/generator"
          viewAll={locale === "ar" ? "عرض الكل" : "View all"}
          empty={locale === "ar" ? "لا توجد اختبارات" : "No tests"}
          rows={(recentGenerator ?? []).map((r: any) => ({
            id: r.id,
            date: r.test_date,
            tag: r.genset_tag,
            who: r.operator_name,
            station: r.stations ? `${r.stations.code} · ${locale === "ar" ? r.stations.name_ar : r.stations.name_en}` : "",
          }))}
        />
      </div>

      <div className="bg-card rounded-xl border p-5">

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> {t("dash.recent_incidents")}
          </h2>
          <Link to="/incidents" className="text-sm text-primary hover:underline">
            {locale === "ar" ? "عرض الكل" : "View all"}
          </Link>
        </div>
        {!recentIncidents || recentIncidents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {locale === "ar" ? "لا توجد حوادث" : "No incidents"}
          </p>
        ) : (
          <ul className="divide-y">
            {recentIncidents.map((inc: any) => (
              <li key={inc.id} className="py-3 flex items-center gap-3">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: SEV_COLORS[inc.severity] ?? "#64748b" }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{inc.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {inc.equipment} · {inc.stations ? (locale === "ar" ? inc.stations.name_ar : inc.stations.name_en) : ""}
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-muted">{inc.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; color: string }) {
  return (
    <div className="bg-card rounded-xl border p-4 flex items-center gap-3">
      <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-bold leading-tight">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-base font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function TestListCard({
  icon: Icon, iconClass, title, linkTo, viewAll, empty, rows,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  linkTo: string;
  viewAll: string;
  empty: string;
  rows: { id: string; date: string; tag?: string | null; who?: string | null; station: string }[];
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Icon className={`h-5 w-5 ${iconClass}`} />
          {title}
        </h3>
        <Link to={linkTo} className="text-sm text-primary hover:underline">{viewAll}</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">{empty}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-sm">{r.station || "—"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.date}{r.who ? ` · ${r.who}` : ""}
                </div>
              </div>
              {r.tag ? <span className="text-xs px-2 py-1 rounded bg-muted shrink-0">{r.tag}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
