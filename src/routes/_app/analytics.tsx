import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { BarChart3, Download, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { createExcelBlob, triggerBlobDownload } from "@/lib/export-utils";

export const Route = createFileRoute("/_app/analytics")({
  head: () => ({
    meta: [
      { title: "Operational Analytics | WTCO Operations" },
      {
        name: "description",
        content:
          "Daily flow, power, gate delivery, tank level and production analytics for all WTCO water transmission stations.",
      },
      { property: "og:title", content: "Operational Analytics | WTCO Operations" },
      {
        property: "og:description",
        content: "Interactive operational analytics built from the monthly operations workbooks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

type ModelKey = "abcfg" | "gate" | "tank" | "production";

interface DailyRow {
  day: string;
  model: ModelKey;
  values: Record<string, number>;
}

const MODELS: { key: ModelKey; ar: string; en: string }[] = [
  { key: "abcfg", ar: "الخطوط والطاقة (A-B-C-F-G)", en: "Lines & Power (A-B-C-F-G)" },
  { key: "production", ar: "الإنتاج", en: "Production" },
  { key: "gate", ar: "البوابات والجهات", en: "Gates & Consumers" },
  { key: "tank", ar: "الخزانات", en: "Tanks" },
];

const COLORS = [
  "hsl(var(--primary))",
  "#0ea5e9",
  "#16a34a",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#ec4899",
];

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function AnalyticsPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [model, setModel] = useState<ModelKey>("abcfg");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<"day" | "month">("day");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["ops-daily", model],
    queryFn: async () => {
      const all: DailyRow[] = [];
      const page = 1000;
      for (let i = 0; ; i += page) {
        const { data, error } = await supabase
          .from("ops_daily")
          .select("day, model, values")
          .eq("model", model)
          .order("day")
          .range(i, i + page - 1);
        if (error) throw error;
        all.push(...((data ?? []) as unknown as DailyRow[]));
        if (!data || data.length < page) break;
      }
      return all;
    },
  });

  const metrics = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => Object.keys(r.values ?? {}).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [rows]);

  const active = selected.length ? selected : metrics.slice(0, 5);

  const filtered = useMemo(
    () => rows.filter((r) => (!from || r.day >= from) && (!to || r.day <= to)),
    [rows, from, to],
  );

  const chartData = useMemo(() => {
    if (granularity === "day") {
      return filtered.map((r) => ({ label: r.day, ...r.values }));
    }
    const byMonth = new Map<string, Record<string, number>>();
    filtered.forEach((r) => {
      const m = r.day.slice(0, 7);
      const acc = byMonth.get(m) ?? {};
      Object.entries(r.values ?? {}).forEach(([k, v]) => {
        acc[k] = (acc[k] ?? 0) + (v ?? 0);
      });
      byMonth.set(m, acc);
    });
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, v]) => ({ label, ...v }));
  }, [filtered, granularity]);

  const totals = useMemo(() => {
    const t: Record<string, { sum: number; count: number; max: number }> = {};
    filtered.forEach((r) =>
      Object.entries(r.values ?? {}).forEach(([k, v]) => {
        const e = (t[k] ??= { sum: 0, count: 0, max: 0 });
        e.sum += v ?? 0;
        e.count += 1;
        e.max = Math.max(e.max, v ?? 0);
      }),
    );
    return t;
  }, [filtered]);

  const toggleMetric = (m: string) =>
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  const exportExcel = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(model.toUpperCase());
      ws.addRow(["DATE", ...metrics]);
      ws.getRow(1).font = { bold: true };
      filtered.forEach((r) => ws.addRow([r.day, ...metrics.map((m) => r.values?.[m] ?? null)]));
      ws.columns.forEach((c) => (c.width = 16));
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.autoFilter = { from: "A1", to: { row: 1, column: metrics.length + 1 } };
      const blob = createExcelBlob(await wb.xlsx.writeBuffer());
      await triggerBlobDownload(blob, `${model}-analytics.xlsx`);
      toast.success(ar ? "تم التصدير" : "Exported");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-bold">{ar ? "التحليلات التشغيلية" : "Operational Analytics"}</h1>
          <p className="text-sm text-muted-foreground">
            {ar
              ? "تحليل يومي وشهري للتدفقات والطاقة والإنتاج والخزانات والجهات المستفيدة"
              : "Daily and monthly analysis of flows, power, production, tanks and consumers"}
          </p>
        </div>
        <button
          onClick={() => void exportExcel()}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          {ar ? "تصدير Excel" : "Export Excel"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {MODELS.map((m) => (
          <button
            key={m.key}
            onClick={() => {
              setModel(m.key);
              setSelected([]);
            }}
            className={`rounded-lg border px-3 py-2 text-sm transition ${
              model === m.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card hover:bg-accent"
            }`}
          >
            {ar ? m.ar : m.en}
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <div className="text-xs text-muted-foreground mb-1">{ar ? "من" : "From"}</div>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <div className="text-xs text-muted-foreground mb-1">{ar ? "إلى" : "To"}</div>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <div className="text-xs text-muted-foreground mb-1">{ar ? "التجميع" : "Granularity"}</div>
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as "day" | "month")}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="day">{ar ? "يومي" : "Daily"}</option>
            <option value="month">{ar ? "شهري" : "Monthly"}</option>
          </select>
        </label>
        <div className="text-xs text-muted-foreground ms-auto">
          {filtered.length} {ar ? "يوم" : "days"}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="text-sm font-semibold mb-2">{ar ? "اختر البنود" : "Select metrics"}</div>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
          {metrics.map((m) => (
            <button
              key={m}
              onClick={() => toggleMetric(m)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                active.includes(m)
                  ? "bg-primary/10 border-primary text-primary"
                  : "hover:bg-accent text-muted-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {active.slice(0, 8).map((m) => {
          const t = totals[m];
          return (
            <div key={m} className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground truncate" title={m}>
                {m}
              </div>
              <div className="text-lg font-bold">{t ? fmt(t.sum) : "-"}</div>
              <div className="text-[11px] text-muted-foreground">
                {ar ? "المتوسط" : "Avg"} {t && t.count ? fmt(t.sum / t.count) : "-"} · {ar ? "الأعلى" : "Max"}{" "}
                {t ? fmt(t.max) : "-"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{ar ? "الاتجاه الزمني" : "Trend over time"}</h2>
        </div>
        {isLoading ? (
          <div className="h-80 rounded-lg bg-muted/30 animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmt(v)} width={70} />
              <Tooltip formatter={(v: number | string) => fmt(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {active.slice(0, 8).map((m, i) => (
                <Line
                  key={m}
                  type="monotone"
                  dataKey={m}
                  stroke={COLORS[i % COLORS.length]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">
          {ar ? "المقارنة الإجمالية" : "Total comparison"}
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={active.slice(0, 12).map((m) => ({ name: m, total: totals[m]?.sum ?? 0 }))}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} height={70} textAnchor="end" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmt(v)} width={70} />
            <Tooltip formatter={(v: number | string) => fmt(Number(v))} />
            <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
