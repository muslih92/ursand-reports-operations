import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { ScadaPanel } from "@/components/scada-panel";
import { useScopedStations, useStationScope } from "@/lib/station-scope";
import { toast } from "sonner";
import { FileSpreadsheet, Printer, TrendingUp } from "lucide-react";
import {
  buildElementPdf,
  createExcelBlob,
  safeFilePart,
  triggerBlobDownload,
} from "@/lib/export-utils";

export const Route = createFileRoute("/_app/trends")({
  component: TrendsPage,
  head: () => ({
    meta: [
      { title: "Unified Trends & Operating Limits | URS Operations" },
      {
        name: "description",
        content:
          "Plot any station reading over hours, days, weeks or months and export the trend to Excel or PDF.",
      },
      { property: "og:title", content: "Trends & Live Charts | URS Operations" },
      {
        property: "og:description",
        content: "Analyse station readings over time and export trend charts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Granularity = "slot" | "day" | "week" | "month";

const COLORS = ["#0ea5e9", "#f97316", "#16a34a", "#dc2626", "#7c3aed", "#0891b2"];

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function bucketKey(date: string, slot: string, g: Granularity) {
  if (g === "slot") return `${date} ${slot.slice(0, 5)}`;
  if (g === "day") return date;
  if (g === "month") return date.slice(0, 7);
  // week -> ISO-ish week starting Sunday
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

function TrendsPage() {
  const { locale, dir } = useI18n();
  const [mode, setMode] = useState<"scada" | "readings">("scada");
  const tabs = [
    { key: "scada" as const, label: locale === "ar" ? "ترند SCADA وحدود التشغيل" : "SCADA & operating limits" },
    { key: "readings" as const, label: locale === "ar" ? "ترند القراءات اليومية" : "Daily readings trend" },
  ];
  return (
    <div className="space-y-4" dir={dir}>
      <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className={`h-9 rounded-lg px-3 text-sm font-medium transition-colors ${
              mode === t.key ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {mode === "scada" ? <ScadaPanel /> : <ReadingsTrends />}
    </div>
  );
}

function ReadingsTrends() {
  const { locale, dir } = useI18n();
  const { scopedStationId, canPickStation } = useStationScope();
  const { data: stations } = useScopedStations();

  const [stationId, setStationId] = useState<string>(scopedStationId ?? "");
  const [templateId, setTemplateId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [from, setFrom] = useState<string>(isoDaysAgo(14));
  const [to, setTo] = useState<string>(todayISO());
  const [granularity, setGranularity] = useState<Granularity>("slot");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!stationId && (scopedStationId || (stations && stations.length === 1))) {
      setStationId(scopedStationId ?? stations![0]!.id);
    }
  }, [scopedStationId, stations, stationId]);

  // templates of the station
  const { data: templates } = useQuery({
    queryKey: ["trend-templates", stationId],
    enabled: !!stationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reading_templates")
        .select("id, code, name_en, name_ar")
        .eq("station_id", stationId)
        .eq("active", true)
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (templates && templates.length > 0 && !templates.some((t) => t.id === templateId)) {
      setTemplateId(templates[0]!.id);
      setSectionId("");
      setFieldIds([]);
    }
  }, [templates, templateId]);

  // sections + fields of the template
  const { data: structure } = useQuery({
    queryKey: ["trend-structure", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const [sectionsRes, fieldsRes] = await Promise.all([
        supabase
          .from("reading_sections")
          .select("id, name_en, name_ar, sort_order")
          .eq("template_id", templateId)
          .order("sort_order"),
        supabase
          .from("reading_fields")
          .select("id, label_en, label_ar, unit, section_id, sort_order")
          .eq("template_id", templateId)
          .order("sort_order"),
      ]);
      if (sectionsRes.error) throw sectionsRes.error;
      if (fieldsRes.error) throw fieldsRes.error;
      return { sections: sectionsRes.data ?? [], fields: fieldsRes.data ?? [] };
    },
  });

  useEffect(() => {
    const secs = structure?.sections ?? [];
    if (secs.length > 0 && !secs.some((s) => s.id === sectionId)) {
      setSectionId(secs[0]!.id);
      setFieldIds([]);
    }
  }, [structure, sectionId]);

  const sectionFields = useMemo(
    () => (structure?.fields ?? []).filter((f) => f.section_id === sectionId),
    [structure, sectionId],
  );

  useEffect(() => {
    if (sectionFields.length > 0 && fieldIds.length === 0) {
      setFieldIds([sectionFields[0]!.id]);
    }
  }, [sectionFields, fieldIds.length]);

  const selectedFields = useMemo(
    () => (structure?.fields ?? []).filter((f) => fieldIds.includes(f.id)),
    [structure, fieldIds],
  );

  // data points
  const { data: series, isFetching } = useQuery({
    queryKey: ["trend-data", stationId, templateId, fieldIds.join(","), from, to, granularity],
    enabled: !!stationId && !!templateId && fieldIds.length > 0,
    queryFn: async () => {
      const { data: entries, error: eErr } = await supabase
        .from("reading_entries")
        .select("id, entry_date")
        .eq("station_id", stationId)
        .eq("template_id", templateId)
        .gte("entry_date", from)
        .lte("entry_date", to)
        .order("entry_date");
      if (eErr) throw eErr;
      const entryList = entries ?? [];
      if (entryList.length === 0) return [];
      const dateById: Record<string, string> = {};
      for (const e of entryList) dateById[e.id] = e.entry_date;

      const { data: vals, error: vErr } = await supabase
        .from("reading_values")
        .select("entry_id, field_id, time_slot, value")
        .in("entry_id", entryList.map((e) => e.id))
        .in("field_id", fieldIds)
        .not("value", "is", null);
      if (vErr) throw vErr;

      // bucket -> field -> [values]
      const buckets = new Map<string, Record<string, number[]>>();
      for (const v of vals ?? []) {
        const date = dateById[v.entry_id];
        if (!date) continue;
        const key = bucketKey(date, v.time_slot, granularity);
        let rec = buckets.get(key);
        if (!rec) {
          rec = {};
          buckets.set(key, rec);
        }
        (rec[v.field_id] ??= []).push(Number(v.value));
      }
      return Array.from(buckets.entries())
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([key, rec]) => {
          const row: Record<string, string | number> = { bucket: key };
          for (const fid of fieldIds) {
            const arr = rec[fid];
            if (arr && arr.length > 0) {
              row[fid] = Number((arr.reduce((s, n) => s + n, 0) / arr.length).toFixed(2));
            }
          }
          return row;
        });
    },
  });

  const rows = series ?? [];
  const station = (stations ?? []).find((s) => s.id === stationId);
  const template = (templates ?? []).find((t) => t.id === templateId);

  const fieldLabel = (f: { label_en: string; label_ar: string | null; unit: string | null }) =>
    `${locale === "ar" ? f.label_ar || f.label_en : f.label_en}${f.unit ? ` (${f.unit})` : ""}`;

  const toggleField = (id: string) => {
    setFieldIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 6 ? cur : [...cur, id],
    );
  };

  const baseName = `Trend_${safeFilePart(station?.code)}_${safeFilePart(template?.code)}_${from}_${to}`;

  const exportExcel = async () => {
    if (rows.length === 0) return toast.error(locale === "ar" ? "لا توجد بيانات" : "No data");
    setBusy(true);
    try {
      const ExcelJS = (await import("exceljs")) as any;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Trend");
      ws.addRow([locale === "ar" ? "المحطة" : "Station", station?.code ?? ""]);
      ws.addRow([locale === "ar" ? "القالب" : "Template", template?.code ?? ""]);
      ws.addRow([locale === "ar" ? "الفترة" : "Period", `${from} → ${to}`]);
      ws.addRow([]);
      const header = [locale === "ar" ? "الوقت" : "Time", ...selectedFields.map(fieldLabel)];
      const hr = ws.addRow(header);
      hr.font = { bold: true };
      for (const r of rows) {
        ws.addRow([r.bucket, ...selectedFields.map((f) => (r as any)[f.id] ?? "")]);
      }
      ws.columns.forEach((c: any) => (c.width = 22));
      const buffer = await wb.xlsx.writeBuffer();
      await triggerBlobDownload(createExcelBlob(buffer), `${baseName}.xlsx`);
      toast.success(locale === "ar" ? "تم التصدير" : "Exported");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async () => {
    if (rows.length === 0) return toast.error(locale === "ar" ? "لا توجد بيانات" : "No data");
    setBusy(true);
    try {
      const file = await buildElementPdf({
        elementId: "trend-print",
        filename: `${baseName}.pdf`,
        orientation: "l",
      });
      await triggerBlobDownload(file.blob, file.filename);
      toast.success(locale === "ar" ? "تم التصدير" : "Exported");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" dir={dir}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          {locale === "ar" ? "الرسوم البيانية والاتجاهات" : "Trends & Charts"}
        </h1>
        <div className="ms-auto flex gap-2">
          <button
            onClick={exportExcel}
            disabled={busy}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-sm hover:bg-accent disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button
            onClick={exportPdf}
            disabled={busy}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-sm hover:bg-accent disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> PDF
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <label className="text-sm space-y-1">
          <span className="font-medium">{locale === "ar" ? "المحطة" : "Station"}</span>
          <select
            value={stationId}
            onChange={(e) => {
              setStationId(e.target.value);
              setTemplateId("");
              setSectionId("");
              setFieldIds([]);
            }}
            disabled={!canPickStation}
            className="w-full h-10 px-2 rounded-lg border bg-background disabled:opacity-70"
          >
            <option value="">--</option>
            {(stations ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm space-y-1">
          <span className="font-medium">{locale === "ar" ? "القالب" : "Template"}</span>
          <select
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setSectionId("");
              setFieldIds([]);
            }}
            className="w-full h-10 px-2 rounded-lg border bg-background"
          >
            {(templates ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {locale === "ar" ? t.name_ar || t.name_en : t.name_en}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm space-y-1">
          <span className="font-medium">{locale === "ar" ? "النظام / الوحدة" : "System / Unit"}</span>
          <select
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setFieldIds([]);
            }}
            className="w-full h-10 px-2 rounded-lg border bg-background"
          >
            {(structure?.sections ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {locale === "ar" ? s.name_ar || s.name_en : s.name_en}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm space-y-1">
          <span className="font-medium">{locale === "ar" ? "من" : "From"}</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full h-10 px-2 rounded-lg border bg-background"
          />
        </label>

        <label className="text-sm space-y-1">
          <span className="font-medium">{locale === "ar" ? "إلى" : "To"}</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full h-10 px-2 rounded-lg border bg-background"
          />
        </label>

        <label className="text-sm space-y-1">
          <span className="font-medium">{locale === "ar" ? "التجميع" : "Granularity"}</span>
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as Granularity)}
            className="w-full h-10 px-2 rounded-lg border bg-background"
          >
            <option value="slot">{locale === "ar" ? "ساعات (كل قراءة)" : "Hourly (per slot)"}</option>
            <option value="day">{locale === "ar" ? "يومي" : "Daily"}</option>
            <option value="week">{locale === "ar" ? "أسبوعي" : "Weekly"}</option>
            <option value="month">{locale === "ar" ? "شهري" : "Monthly"}</option>
          </select>
        </label>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="text-sm font-semibold mb-2">
          {locale === "ar" ? "اختر القراءات (حتى 6)" : "Select readings (up to 6)"}
        </div>
        <div className="flex flex-wrap gap-2">
          {sectionFields.map((f) => {
            const active = fieldIds.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleField(f.id)}
                className={`px-3 h-9 rounded-lg border text-xs font-medium transition-colors ${
                  active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                }`}
              >
                {fieldLabel(f)}
              </button>
            );
          })}
          {sectionFields.length === 0 && (
            <div className="text-sm text-muted-foreground">
              {locale === "ar" ? "لا توجد حقول" : "No fields"}
            </div>
          )}
        </div>
      </div>

      <div id="trend-print" className="rounded-xl border bg-card p-4 space-y-4">
        <div className="text-center">
          <div className="font-bold">
            {station?.code} · {locale === "ar" ? template?.name_ar || template?.name_en : template?.name_en}
          </div>
          <div className="text-xs text-muted-foreground">
            {from} → {to} ·{" "}
            {granularity === "slot"
              ? locale === "ar"
                ? "ساعات"
                : "Hourly"
              : granularity === "day"
                ? locale === "ar"
                  ? "يومي"
                  : "Daily"
                : granularity === "week"
                  ? locale === "ar"
                    ? "أسبوعي"
                    : "Weekly"
                  : locale === "ar"
                    ? "شهري"
                    : "Monthly"}
          </div>
        </div>

        <div className="h-[380px] w-full" dir="ltr">
          {rows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {isFetching
                ? locale === "ar"
                  ? "جاري التحميل..."
                  : "Loading..."
                : locale === "ar"
                  ? "لا توجد بيانات في هذه الفترة"
                  : "No data for this period"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 10, right: 20, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend verticalAlign="top" />
                {selectedFields.map((f, i) => (
                  <Line
                    key={f.id}
                    type="monotone"
                    dataKey={f.id}
                    name={fieldLabel(f)}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {rows.length > 0 && (
          <div className="overflow-auto">
            <table className="w-full text-xs border">
              <thead className="bg-muted/30">
                <tr>
                  <th className="border px-2 py-1 text-start">{locale === "ar" ? "الوقت" : "Time"}</th>
                  {selectedFields.map((f) => (
                    <th key={f.id} className="border px-2 py-1 text-start">
                      {fieldLabel(f)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.bucket)}>
                    <td className="border px-2 py-1">{r.bucket}</td>
                    {selectedFields.map((f) => (
                      <td key={f.id} className="border px-2 py-1">
                        {(r as any)[f.id] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
