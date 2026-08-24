import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useScopedStations, useStationScope } from "@/lib/station-scope";
import { readDraft, useAutoDraft } from "@/lib/local-draft";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Save,
  ClipboardList,
  CheckCircle2,
  Circle,
  Printer,
  FileSpreadsheet,
} from "lucide-react";
import { z } from "zod";
import { buildElementPdf, createExcelBlob, safeFilePart, triggerBlobDownload, type DownloadLink } from "@/lib/export-utils";
import { isDeviating, deviationPct, notifyStation } from "@/lib/notifications";

/** Collect all cells that deviate more than 10% from the previous-day average. */
function collectDeviations(
  values: Record<string, string>,
  baseline: Record<string, number>,
  fields: { id: string; label_en: string; label_ar: string | null; unit: string | null }[],
  locale: "ar" | "en",
) {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out: { text: string }[] = [];
  const seen = new Set<string>();
  for (const [key, raw] of Object.entries(values)) {
    const [fieldId, slot] = key.split("|");
    const base = baseline[fieldId];
    const num = Number(String(raw).trim());
    if (!raw || Number.isNaN(num)) continue;
    if (!isDeviating(num, base)) continue;
    const f = byId.get(fieldId);
    if (!f) continue;
    const label = (locale === "ar" ? f.label_ar : f.label_en) ?? f.label_en;
    const sig = `${fieldId}|${slot}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({
      text: `• ${label} @${slot}: ${num} (${deviationPct(num, base).toFixed(1)}% ${
        locale === "ar" ? "عن متوسط أمس" : "vs yesterday avg"
      } ${base.toFixed(2)})`,
    });
  }
  return out;
}


const searchSchema = z.object({
  template: z.string().optional(),
  date: z.string().optional(),
  station: z.string().optional(),
});

export const Route = createFileRoute("/_app/readings")({
  validateSearch: searchSchema,
  component: ReadingsPage,
});

interface Template {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  frequency: string;
  time_slots: string[];
  active: boolean;
}
interface Section {
  id: string;
  template_id: string;
  sort_order: number;
  name_en: string;
  name_ar: string;
}
interface Field {
  id: string;
  section_id: string;
  template_id: string;
  sort_order: number;
  label_en: string;
  label_ar: string;
  unit: string | null;
}
interface Station {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_TOKENS = ["in_service", "standby", "maintenance", "fixed_speed"] as const;
type StatusToken = (typeof STATUS_TOKENS)[number];

function statusAbbr(token: string): string {
  switch (token) {
    case "in_service": return "IN";
    case "standby": return "N/V";
    case "maintenance": return "M";
    case "fixed_speed": return "F/S";
    default: return "";
  }
}
function statusLabel(token: string, locale: "ar" | "en"): string {
  const m: Record<string, { ar: string; en: string }> = {
    in_service: { ar: "في الخدمة", en: "In Service" },
    standby: { ar: "احتياطي (N/V)", en: "Standby (N/V)" },
    maintenance: { ar: "تحت الصيانة", en: "Maintenance" },
    fixed_speed: { ar: "سرعة ثابتة", en: "Fixed Speed" },
  };
  return m[token]?.[locale] ?? token;
}
// Quick status marks applied to a whole unit at a given time slot
const QUICK_MARKS = [
  { code: "SHUTDOWN", ar: "إيقاف", en: "Shutdown", cls: "bg-red-100 text-red-800 border-red-300" },
  { code: "STANDBY", ar: "احتياطي", en: "Standby", cls: "bg-yellow-100 text-yellow-900 border-yellow-300" },
  { code: "BUSY", ar: "تحت الصيانة", en: "Under Maintenance", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  { code: "OOS", ar: "خارج الخدمة", en: "Out of Service (OOS)", cls: "bg-slate-200 text-slate-800 border-slate-400" },
] as const;

// Allowed delay (minutes) after the scheduled slot before the actual entry time is flagged
const LATE_LIMIT_MIN = 90;

function slotToMinutes(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fmtLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function isLate(slot: string, iso: string): boolean {
  const d = new Date(iso);
  const actual = d.getHours() * 60 + d.getMinutes();
  return actual - slotToMinutes(slot) > LATE_LIMIT_MIN;
}

/* ---- 12-hour shift lock (operators) ----
   Day shift 06:00–18:00, night shift 18:00–06:00 (next day).
   A time slot stays editable only until the end of the shift it belongs to. */
function shiftEnd(entryDate: string, slot: string): Date {
  const [y, m, d] = entryDate.split("-").map(Number);
  const mins = slotToMinutes(slot);
  const base = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  if (mins < 6 * 60) {
    // belongs to the night shift that started the previous evening → ends today 06:00
    base.setHours(6, 0, 0, 0);
  } else if (mins < 18 * 60) {
    base.setHours(18, 0, 0, 0);
  } else {
    base.setDate(base.getDate() + 1);
    base.setHours(6, 0, 0, 0);
  }
  return base;
}
function isSlotLocked(entryDate: string, slot: string, now: Date = new Date()): boolean {
  return now.getTime() >= shiftEnd(entryDate, slot).getTime();
}


function statusClass(token: string): string {
  switch (token) {
    case "in_service": return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "standby": return "bg-yellow-100 text-yellow-900 border-yellow-300";
    case "maintenance": return "bg-blue-100 text-blue-800 border-blue-300";
    case "fixed_speed": return "bg-orange-100 text-orange-800 border-orange-300";
    default: return "bg-muted";
  }
}

function ReadingsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/readings" });
  const { profile, isAdmin, hasRole } = useAuth();
  const { scopedStationId, canPickStation: canPick } = useStationScope();
  const canPickStation = (isAdmin || hasRole("supervisor") || hasRole("viewer")) && canPick;

  const date = search.date ?? todayISO();
  const stationId = scopedStationId ?? search.station ?? profile?.station_id ?? undefined;
  const templateId = search.template;

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }), replace: false });
  };

  if (!templateId) {
    return (
      <ListView
        date={date}
        stationId={stationId}
        canPickStation={canPickStation}
        onSelect={(id) => setSearch({ template: id, date, station: stationId })}
        onOpenEntry={(tpl, d, st) => setSearch({ template: tpl, date: d, station: st })}
        onDate={(d) => setSearch({ date: d })}
        onStation={(s) => setSearch({ station: s })}
      />
    );
  }
  return (
    <EntryView
      templateId={templateId}
      date={date}
      stationId={stationId}
      onBack={() => setSearch({ template: undefined })}
    />
  );
}

/* ============================ LIST VIEW ============================ */

function ListView({
  date,
  stationId,
  canPickStation,
  onSelect,
  onOpenEntry,
  onDate,
  onStation,
}: {
  date: string;
  stationId: string | undefined;
  canPickStation: boolean;
  onSelect: (id: string) => void;
  onOpenEntry: (templateId: string, date: string, stationId: string) => void;
  onDate: (d: string) => void;
  onStation: (s: string) => void;
}) {
  const { locale, t, dir } = useI18n();
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);


  const { data: stations } = useScopedStations();

  // Saved reading records (most recent first) — visible immediately on open
  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ["reading-records", stationId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("reading_entries")
        .select("id, entry_date, template_id, station_id, operator_name")
        .order("entry_date", { ascending: false })
        .limit(60);
      if (stationId) q = q.eq("station_id", stationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        entry_date: string;
        template_id: string;
        station_id: string;
        operator_name: string | null;
      }[];
    },
  });

  const { data: allTemplates } = useQuery({
    queryKey: ["templates", "all-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reading_templates")
        .select("id, code, name_en, name_ar");
      if (error) throw error;
      return data as { id: string; code: string; name_en: string; name_ar: string }[];
    },
  });

  const tplById = useMemo(
    () => Object.fromEntries((allTemplates ?? []).map((t2) => [t2.id, t2])),
    [allTemplates],
  );
  const stById = useMemo(
    () => Object.fromEntries((stations ?? []).map((s) => [s.id, s])),
    [stations],
  );

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates", "active", stationId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("reading_templates")
        .select("id, code, name_en, name_ar, frequency, time_slots, active")
        .eq("active", true);
      if (stationId) q = q.eq("station_id", stationId);
      const { data, error } = await q.order("code");
      if (error) throw error;
      return data as Template[];
    },
  });


  const { data: progress } = useQuery({
    queryKey: ["progress", date, stationId ?? "any"],
    enabled: !!templates && templates.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("reading_entries")
        .select("id, template_id, reading_values(time_slot)")
        .eq("entry_date", date);
      if (stationId) q = q.eq("station_id", stationId);
      const { data, error } = await q;
      if (error) throw error;
      const map: Record<string, Set<string>> = {};
      for (const row of data ?? []) {
        const rv = (row as { template_id: string; reading_values: { time_slot: string }[] });
        map[rv.template_id] ??= new Set();
        for (const v of rv.reading_values ?? []) map[rv.template_id].add(v.time_slot);
      }
      return map;
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" />
              {t("nav.readings")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {locale === "ar"
                ? "السجلات المحفوظة — اضغط على أي سجل لفتحه"
                : "Saved records — click any record to open it"}
            </p>
          </div>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="ms-auto h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            {showNew
              ? locale === "ar" ? "إخفاء" : "Hide"
              : locale === "ar" ? "+ قراءة جديدة" : "+ New reading"}
          </button>
        </div>


        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">{t("common.date")}</label>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => onDate(e.target.value)}
              className="h-10 px-3 rounded-lg border bg-background text-sm"
              dir="ltr"
            />
          </div>
          {canPickStation && (
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <label className="text-xs text-muted-foreground">{t("common.station")}</label>
              <select
                value={stationId ?? ""}
                onChange={(e) => onStation(e.target.value)}
                className="h-10 px-3 rounded-lg border bg-background text-sm"
                dir={dir}
              >
                <option value="">{locale === "ar" ? "— اختر محطة —" : "— Pick station —"}</option>
                {(stations ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {locale === "ar" ? s.name_ar : s.name_en}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Saved records list */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">
            {locale === "ar" ? "سجلات القراءات المحفوظة" : "Saved reading records"}
          </span>
          <span className="text-xs text-muted-foreground">
            {selected.size > 0
              ? locale === "ar" ? `${selected.size} محدد` : `${selected.size} selected`
              : locale === "ar" ? "حدد السجلات لتصديرها" : "Select records to export"}
          </span>
          <button
            disabled={selected.size === 0 || exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const rows = (recent ?? []).filter((r) => selected.has(r.id));
                const { blob, filename } = await exportSelectedReadingsXlsx({
                  locale,
                  entries: rows.map((r) => ({
                    ...r,
                    stationCode: stById[r.station_id]?.code ?? "",
                    templateName: tplById[r.template_id]
                      ? locale === "ar"
                        ? tplById[r.template_id].name_ar
                        : tplById[r.template_id].name_en
                      : "",
                  })),
                });
                await triggerBlobDownload(blob, filename);
                toast.success(locale === "ar" ? "تم تصدير ملف Excel" : "Excel exported");
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setExporting(false);
              }
            }}
            className="ms-auto h-9 px-3 rounded-lg border text-sm inline-flex items-center gap-2 disabled:opacity-50 hover:bg-accent"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting
              ? locale === "ar" ? "جارٍ التصدير…" : "Exporting…"
              : locale === "ar" ? "تصدير Excel للمحدد" : "Export selected to Excel"}
          </button>
        </div>
        {recentLoading ? (
          <div className="p-6 text-sm text-muted-foreground text-center">{t("common.loading")}</div>
        ) : (recent ?? []).length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            {locale === "ar" ? "لا توجد سجلات بعد" : "No records yet"}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs">
                <tr>
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={(recent ?? []).length > 0 && selected.size === (recent ?? []).length}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set((recent ?? []).map((r) => r.id)) : new Set())
                      }
                    />
                  </th>
                  <th className="px-3 py-2 text-start">{t("common.date")}</th>
                  <th className="px-3 py-2 text-start">{t("common.station")}</th>
                  <th className="px-3 py-2 text-start">{locale === "ar" ? "القالب" : "Template"}</th>
                  <th className="px-3 py-2 text-start">{locale === "ar" ? "بواسطة" : "By"}</th>
                </tr>
              </thead>
              <tbody>
                {(recent ?? []).map((r) => {
                  const tpl = tplById[r.template_id];
                  const st = stById[r.station_id];
                  return (
                    <tr
                      key={r.id}
                      onClick={() => onOpenEntry(r.template_id, r.entry_date, r.station_id)}
                      className="border-t cursor-pointer hover:bg-accent/50"
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={(e) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(r.id);
                              else next.delete(r.id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" dir="ltr">{r.entry_date}</td>
                      <td className="px-3 py-2">{st ? st.code : "—"}</td>
                      <td className="px-3 py-2">
                        {tpl ? (locale === "ar" ? tpl.name_ar : tpl.name_en) : "—"}
                      </td>
                      <td className="px-3 py-2">{r.operator_name ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        )}
      </div>

      {!showNew ? null : !stationId ? (
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          {locale === "ar" ? "اختر محطة للمتابعة" : "Pick a station to continue"}
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(templates ?? []).map((tpl) => {
            const done = progress?.[tpl.id]?.size ?? 0;
            const total = tpl.time_slots.length;
            const pct = total ? Math.round((done / total) * 100) : 0;
            const full = done >= total && total > 0;
            return (
              <button
                key={tpl.id}
                onClick={() => onSelect(tpl.id)}
                className="text-start rounded-xl border bg-card p-4 hover:border-primary hover:shadow-sm transition group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">
                      {locale === "ar" ? tpl.name_ar : tpl.name_en}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {tpl.code} · {freqLabel(tpl.frequency, locale)}
                    </div>
                  </div>
                  {full ? (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                </div>
                <div className="mt-3">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all ${full ? "bg-success" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5">
                    {done} / {total} {locale === "ar" ? "قراءة" : "readings"}
                  </div>
                </div>
              </button>
            );
          })}
          {(templates ?? []).length === 0 && (
            <div className="col-span-full text-sm text-muted-foreground text-center py-8">
              {locale === "ar" ? "لا توجد قوالب" : "No templates"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function freqLabel(f: string, locale: "ar" | "en") {
  const m: Record<string, { ar: string; en: string }> = {
    hourly: { ar: "كل ساعة", en: "Hourly" },
    every_2h: { ar: "كل ساعتين", en: "Every 2h" },
    every_4h: { ar: "كل 4 ساعات", en: "Every 4h" },
    every_6h: { ar: "كل 6 ساعات", en: "Every 6h" },
  };
  return m[f]?.[locale] ?? f;
}

/* ============================ ENTRY VIEW ============================ */

function EntryView({
  templateId,
  date,
  stationId,
  onBack,
}: {
  templateId: string;
  date: string;
  stationId: string | undefined;
  onBack: () => void;
}) {
  const { locale, t, dir } = useI18n();
  const { profile, isAdmin, hasRole } = useAuth();
  const qc = useQueryClient();
  const canWrite =
    isAdmin ||
    hasRole("supervisor") ||
    (hasRole("operator") && stationId === profile?.station_id);
  // Operators lose edit access to a time slot once its 12-hour shift is over
  const shiftLockActive = !isAdmin && !hasRole("supervisor");
  const slotLocked = (slot: string) => shiftLockActive && isSlotLocked(date, slot);
  const cellWritable = (slot: string) => canWrite && !slotLocked(slot);

  const { data, isLoading } = useQuery({
    queryKey: ["reading-entry", templateId, date, stationId ?? "none"],
    enabled: !!stationId,
    queryFn: async () => {
      const [tplRes, sectionsRes, fieldsRes, entryRes] = await Promise.all([
        supabase
          .from("reading_templates")
          .select("id, code, name_en, name_ar, frequency, time_slots, active")
          .eq("id", templateId)
          .single(),
        supabase
          .from("reading_sections")
          .select("id, template_id, sort_order, name_en, name_ar")
          .eq("template_id", templateId)
          .order("sort_order"),
        supabase
          .from("reading_fields")
          .select("id, section_id, template_id, sort_order, label_en, label_ar, unit")
          .eq("template_id", templateId)
          .order("sort_order"),
        supabase
          .from("reading_entries")
          .select("id, notes, operator_name, reading_values(id, field_id, time_slot, value, status, recorded_at)")
          .eq("template_id", templateId)
          .eq("entry_date", date)
          .eq("station_id", stationId!)
          .maybeSingle(),
      ]);
      if (tplRes.error) throw tplRes.error;
      if (sectionsRes.error) throw sectionsRes.error;
      if (fieldsRes.error) throw fieldsRes.error;
      if (entryRes.error) throw entryRes.error;
      return {
        template: tplRes.data as Template,
        sections: (sectionsRes.data ?? []) as Section[],
        fields: (fieldsRes.data ?? []) as Field[],
        entry: entryRes.data as
          | { id: string; notes: string | null; operator_name: string | null; reading_values: { id: string; field_id: string; time_slot: string; value: number | null; status: string | null; recorded_at: string | null }[] }
          | null,
      };
    },
  });

  // ---- Previous-day baseline (average per field) for the 10% deviation check ----
  const prevDate = useMemo(() => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [date]);

  const { data: baseline } = useQuery({
    queryKey: ["reading-baseline", templateId, prevDate, stationId ?? "none"],
    enabled: !!stationId,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data: prevEntry, error } = await supabase
        .from("reading_entries")
        .select("id, reading_values(field_id, value)")
        .eq("template_id", templateId)
        .eq("entry_date", prevDate)
        .eq("station_id", stationId!)
        .maybeSingle();
      if (error) throw error;
      const acc: Record<string, { sum: number; n: number }> = {};
      const rows = (prevEntry as { reading_values?: { field_id: string; value: number | null }[] } | null)
        ?.reading_values ?? [];
      for (const rv of rows) {
        if (rv.value === null || rv.value === undefined) continue;
        const v = Number(rv.value);
        if (Number.isNaN(v)) continue;
        acc[rv.field_id] ??= { sum: 0, n: 0 };
        acc[rv.field_id].sum += v;
        acc[rv.field_id].n += 1;
      }
      const out: Record<string, number> = {};
      for (const [k, a] of Object.entries(acc)) if (a.n > 0) out[k] = a.sum / a.n;
      return out;
    },
  });



  // key = `${fieldId}|${slot}` -> string value
  const [values, setValues] = useState<Record<string, string>>({});
  // per-field status: fieldId -> status token (empty = numeric mode)
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [excelDownload, setExcelDownload] = useState<DownloadLink | null>(null);
  const [pdfDownload, setPdfDownload] = useState<DownloadLink | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activeMark, setActiveMark] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>("");
  const [restoredAt, setRestoredAt] = useState<number | null>(null);

  // Default to showing ONE system at a time (first available), not everything.
  useEffect(() => {
    const secs = data?.sections ?? [];
    if (secs.length === 0) return;
    setActiveSection((cur) => {
      if (cur && (cur === "all" || secs.some((s) => s.id === cur))) return cur;
      const withFields = new Set((data?.fields ?? []).map((f) => f.section_id));
      const first = secs.find((s) => withFields.has(s.id)) ?? secs[0];
      return first.id;
    });
  }, [data]);

  const draftKey = `readings:${templateId}:${date}:${stationId ?? "none"}`;

  useEffect(() => {
    if (!data) return;
    const v: Record<string, string> = {};
    const s: Record<string, string> = {};
    const tokenSet = new Set<string>(STATUS_TOKENS as readonly string[]);
    for (const rv of data.entry?.reading_values ?? []) {
      const key = `${rv.field_id}|${rv.time_slot}`;
      if (rv.value != null) {
        v[key] = String(rv.value);
      } else if (rv.status) {
        if (tokenSet.has(rv.status)) {
          s[rv.field_id] = rv.status;
        } else {
          v[key] = rv.status;
        }
      } else {
        v[key] = "";
      }
    }
    let n = data.entry?.notes ?? "";
    // Restore an unsaved local draft (idle / refresh / accidental close)
    const draft = readDraft<{ values: Record<string, string>; statuses: Record<string, string>; notes: string }>(draftKey);
    if (draft) {
      Object.assign(v, draft.data.values ?? {});
      Object.assign(s, draft.data.statuses ?? {});
      if (draft.data.notes) n = draft.data.notes;
      setRestoredAt(draft.savedAt);
    }
    setValues(v);
    setStatuses(s);
    setNotes(n);
    setOperatorName(profile?.full_name ?? data.entry?.operator_name ?? "");
    setHydrated(true);
  }, [data, profile?.full_name, draftKey]);

  const draftData = useMemo(() => ({ values, statuses, notes }), [values, statuses, notes]);
  const { savedAt: draftSavedAt, clear: clearLocalDraft } = useAutoDraft(draftKey, draftData, hydrated && canWrite);
  const [autoSavedAt, setAutoSavedAt] = useState<number | null>(null);
  const lastAutoSavedRef = useRef<string>("");





  useEffect(() => {
    return () => {
      if (excelDownload) URL.revokeObjectURL(excelDownload.url);
      if (pdfDownload) URL.revokeObjectURL(pdfDownload.url);
    };
  }, [excelDownload, pdfDownload]);

  const save = useMutation({
    mutationFn: async (_vars?: { silent?: boolean }) => {
      if (!stationId) throw new Error("no station");
      // 1) upsert entry (never fail on a duplicate template_id+entry_date row)
      let entryId = data?.entry?.id;
      if (!entryId) {
        const { data: created, error } = await supabase
          .from("reading_entries")
          .upsert(
            {
              template_id: templateId,
              station_id: stationId,
              entry_date: date,
              operator_id: profile?.id,
              operator_name: profile?.full_name ?? operatorName,
              notes: notes || null,
            },
            { onConflict: "template_id,entry_date" },
          )
          .select("id")
          .single();
        if (error) {
          // fall back: the row exists but is not visible to this query shape
          const { data: found, error: findErr } = await supabase
            .from("reading_entries")
            .select("id")
            .eq("template_id", templateId)
            .eq("entry_date", date)
            .maybeSingle();
          if (findErr || !found) throw error;
          entryId = found.id;
        } else {
          entryId = created.id;
        }
      } else {
        const { error } = await supabase
          .from("reading_entries")
          .update({
            operator_name: profile?.full_name ?? operatorName,
            notes: notes || null,
          })
          .eq("id", entryId);
        if (error) throw error;
      }

      // 2) build value rows (only for cells with content)
      const existing = new Map<string, string>(
        (data?.entry?.reading_values ?? []).map((rv) => [`${rv.field_id}|${rv.time_slot}`, rv.id]),
      );
      const nowIso = new Date().toISOString();
      const toUpsert: { entry_id: string; field_id: string; time_slot: string; value: number | null; status: string | null; recorded_at: string }[] = [];
      const toDelete: string[] = [];
      let skippedLocked = 0;

      const handledKeys = new Set<string>();

      // 1) Fields with a row-level status: emit one row per slot with status token, value null.
      for (const [fieldId, st] of Object.entries(statuses)) {
        if (!st) continue;
        for (const slot of data!.template.time_slots) {
          const key = `${fieldId}|${slot}`;
          handledKeys.add(key);
          if (slotLocked(slot)) continue;
          toUpsert.push({ entry_id: entryId!, field_id: fieldId, time_slot: slot, value: null, status: st, recorded_at: nowIso });
        }
      }

      // 2) Cells for fields without row status. Numeric → value; text → status.
      for (const [key, raw] of Object.entries(values)) {
        if (handledKeys.has(key)) continue;
        const [field_id, time_slot] = key.split("|");
        if (statuses[field_id]) continue;
        if (slotLocked(time_slot)) {
          if (raw.trim() !== "" && !existing.has(key)) skippedLocked++;
          continue; // shift closed → not editable
        }
        const trimmed = raw.trim();
        if (trimmed === "") {
          const id = existing.get(key);
          if (id) toDelete.push(id);
          continue;
        }
        const num = Number(trimmed);
        if (!Number.isNaN(num) && trimmed !== "") {
          toUpsert.push({ entry_id: entryId!, field_id, time_slot, value: num, status: null, recorded_at: nowIso });
        } else {
          toUpsert.push({ entry_id: entryId!, field_id, time_slot, value: null, status: trimmed, recorded_at: nowIso });
        }
      }


      if (toDelete.length > 0) {
        const { error } = await supabase.from("reading_values").delete().in("id", toDelete);
        if (error) throw error;
      }
      // write in chunks so large sheets never hit a request-size limit silently
      const CHUNK = 300;
      for (let i = 0; i < toUpsert.length; i += CHUNK) {
        const { error } = await supabase
          .from("reading_values")
          .upsert(toUpsert.slice(i, i + CHUNK), { onConflict: "entry_id,field_id,time_slot" });
        if (error) throw error;
      }

      // 3) verify the write actually landed in the database
      let verifiedMissing = 0;
      if (toUpsert.length > 0) {
        const { data: saved, error: verifyErr } = await supabase
          .from("reading_values")
          .select("field_id, time_slot")
          .eq("entry_id", entryId!);
        if (verifyErr) throw verifyErr;
        const savedKeys = new Set((saved ?? []).map((r) => `${r.field_id}|${r.time_slot}`));
        verifiedMissing = toUpsert.filter((r) => !savedKeys.has(`${r.field_id}|${r.time_slot}`)).length;
        if (verifiedMissing > 0) {
          throw new Error(
            locale === "ar"
              ? `لم يتم حفظ ${verifiedMissing} قراءة في قاعدة البيانات. أعد المحاولة (البيانات محفوظة محلياً).`
              : `${verifiedMissing} readings did not reach the database. Please retry (your input is kept locally).`,
          );
        }
      }

      return { saved: toUpsert.length, deleted: toDelete.length, skippedLocked };
    },

    onSuccess: (res, vars) => {
      clearLocalDraft();
      setRestoredAt(null);
      setAutoSavedAt(Date.now());
      if (!vars?.silent) {
        toast.success(
          locale === "ar"
            ? `تم الحفظ والتحقق: ${res?.saved ?? 0} قراءة`
            : `Saved & verified: ${res?.saved ?? 0} readings`,
        );
      }
      if ((res?.skippedLocked ?? 0) > 0 && !vars?.silent) {
        toast.warning(
          locale === "ar"
            ? `لم يتم حفظ ${res!.skippedLocked} قيمة لأن ورديتها مقفلة (انتهى الشفت). راجع المشرف.`
            : `${res!.skippedLocked} values were not saved because their shift is closed. Contact your supervisor.`,
        );
      }


      qc.invalidateQueries({ queryKey: ["reading-entry", templateId, date, stationId ?? "none"] });
      qc.invalidateQueries({ queryKey: ["progress", date, stationId ?? "any"] });
      qc.invalidateQueries({ queryKey: ["dash-stats"] });

      // 10% deviation alert -> station supervisors + management
      const devs = collectDeviations(values, baseline ?? {}, data?.fields ?? [], locale);
      if (devs.length > 0 && stationId) {
        const lines = devs.slice(0, 6).map((d) => d.text).join("\n");
        const more = devs.length > 6 ? `\n… +${devs.length - 6}` : "";
        void notifyStation({
          stationId,
          kind: "reading_deviation",
          title:
            locale === "ar"
              ? `انحراف يتجاوز ١٠٪ في قراءات ${data?.template.code ?? ""} (${date})`
              : `Deviation over 10% in ${data?.template.code ?? ""} readings (${date})`,
          body:
            (locale === "ar"
              ? "يرجى المتابعة والتحقق من الحاجة إلى صيانة:\n"
              : "Please follow up and check if maintenance is needed:\n") + lines + more,
          link: "/readings",
        }).catch(() => undefined);
      }
    },

    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    },
  });

  // Automatic save to the database — no manual confirmation needed.
  useEffect(() => {
    if (!hydrated || !canWrite || !stationId) return;
    const snapshot = JSON.stringify(draftData);
    if (lastAutoSavedRef.current === "") {
      lastAutoSavedRef.current = snapshot;
      return;
    }
    if (snapshot === lastAutoSavedRef.current) return;
    const id = window.setTimeout(() => {
      if (save.isPending) return;
      lastAutoSavedRef.current = snapshot;
      save.mutate({ silent: true });
    }, 2000);
    return () => window.clearTimeout(id);
  }, [draftData, hydrated, canWrite, stationId]);

  // Reset the autosave baseline when the sheet (template/date/station) changes.
  useEffect(() => {
    lastAutoSavedRef.current = "";
    setAutoSavedAt(null);
  }, [draftKey]);



  const fieldsBySection = useMemo(() => {
    const m: Record<string, Field[]> = {};
    for (const f of data?.fields ?? []) {
      m[f.section_id] ??= [];
      m[f.section_id].push(f);
    }
    return m;
  }, [data?.fields]);

  const slotRecorded = useMemo(() => {
    const m: Record<string, string> = {};
    for (const rv of data?.entry?.reading_values ?? []) {
      if (!rv.recorded_at) continue;
      const cur = m[rv.time_slot];
      if (!cur || new Date(rv.recorded_at) > new Date(cur)) m[rv.time_slot] = rv.recorded_at;
    }
    return m;
  }, [data?.entry?.reading_values]);

  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  if (!stationId) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-primary">
          <Back className="h-4 w-4" /> {locale === "ar" ? "رجوع" : "Back"}
        </button>
        <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          {locale === "ar" ? "اختر محطة أولاً" : "Pick a station first"}
        </div>
      </div>
    );
  }

  if (isLoading || !data || !hydrated) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-primary">
          <Back className="h-4 w-4" /> {locale === "ar" ? "رجوع" : "Back"}
        </button>
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  const { template, sections } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent"
        >
          <Back className="h-4 w-4" /> {locale === "ar" ? "رجوع" : "Back"}
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">
            {locale === "ar" ? template.name_ar : template.name_en}
          </h1>
          <p className="text-xs text-muted-foreground">
            {template.code} · {freqLabel(template.frequency, locale)} · {date}
          </p>
          {(save.isPending || autoSavedAt || draftSavedAt) && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
              {save.isPending
                ? locale === "ar"
                  ? "جارٍ الحفظ التلقائي…"
                  : "Auto-saving…"
                : autoSavedAt
                  ? locale === "ar"
                    ? `تم الحفظ التلقائي ${new Date(autoSavedAt).toLocaleTimeString()}`
                    : `Auto-saved at ${new Date(autoSavedAt).toLocaleTimeString()}`
                  : locale === "ar"
                    ? "الحفظ التلقائي مفعّل"
                    : "Auto-save is on"}
            </p>
          )}

        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={async () => {
              try {
                const secPart =
                  activeSection && activeSection !== "all"
                    ? safeFilePart(sections.find((s) => s.id === activeSection)?.name_en)
                    : "All";
                const file = await buildElementPdf({
                  elementId: "readings-print-sheet",
                  filename: `Readings_${safeFilePart(template.code)}_${secPart}_${date}.pdf`,
                  orientation: "l",
                  minWidth: 1100,
                });

                const link = await triggerBlobDownload(file.blob, file.filename);
                setPdfDownload((previous) => {
                  if (previous) URL.revokeObjectURL(previous.url);
                  return link;
                });
                toast.success(
                  locale === "ar"
                    ? "تم تجهيز ملف PDF. إذا لم يبدأ التحميل اضغط رابط التحميل."
                    : "PDF file is ready. If it does not download, use the download link.",
                );
              } catch (err) {
                console.error("PDF export failed", err);
                toast.error(
                  (locale === "ar" ? "تعذر تصدير PDF: " : "PDF export failed: ") +
                    ((err as Error)?.message || String(err)),
                );
              }
            }}
            className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent"
          >
            <Printer className="h-4 w-4" />
            {locale === "ar" ? "تصدير PDF" : "Export PDF"}
          </button>
          {pdfDownload && (
            <a
              href={pdfDownload.url}
              download={pdfDownload.filename}
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border border-primary text-primary hover:bg-accent"
            >
              <Printer className="h-4 w-4" />
              {locale === "ar" ? "تحميل PDF" : "Download PDF"}
            </a>
          )}
          <button
            onClick={async () => {
              try {
                const file = await exportReadingsXlsx({
                  locale,
                  template,
                  sections:
                    activeSection && activeSection !== "all"
                      ? sections.filter((s) => s.id === activeSection)
                      : sections,
                  fieldsBySection,
                  values,


                  date,
                  stationId,
                  operatorName,
                  notes,
                });
                const link = await triggerBlobDownload(file.blob, file.filename);
                setExcelDownload((previous) => {
                  if (previous) URL.revokeObjectURL(previous.url);
                  return link;
                });
                toast.success(
                  locale === "ar"
                    ? "تم تجهيز ملف Excel. إذا لم يبدأ التحميل اضغط رابط التحميل."
                    : "Excel file is ready. If it does not download, use the download link.",
                );
              } catch (err) {
                console.error("Excel export failed", err);
                toast.error(
                  (locale === "ar" ? "تعذر تصدير Excel: " : "Excel export failed: ") +
                    ((err as Error)?.message || String(err)),
                );
              }
            }}
            className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            {locale === "ar" ? "تصدير Excel" : "Export Excel"}
          </button>
          {excelDownload && (
            <a
              href={excelDownload.url}
              download={excelDownload.filename}
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border border-primary text-primary hover:bg-accent"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {locale === "ar" ? "تحميل Excel" : "Download Excel"}
            </a>
          )}
          <button
            onClick={() => save.mutate()}
            disabled={!canWrite || save.isPending}
            className="inline-flex items-center gap-2 text-sm px-4 h-9 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90"
          >
            <Save className="h-4 w-4" />
            {save.isPending ? (locale === "ar" ? "جارٍ الحفظ…" : "Saving…") : t("common.save")}
          </button>
        </div>
      </div>

      {!canWrite && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
          {locale === "ar" ? "وضع القراءة فقط" : "Read-only mode"}
        </div>
      )}

      {canWrite && shiftLockActive && template && template.time_slots.some((s) => slotLocked(s)) && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
          {locale === "ar"
            ? "بعض الأوقات مقفلة لانتهاء ورديتها (١٢ ساعة). يمكنك إدخال قراءات وردتيك الحالية فقط."
            : "Some time slots are locked because their 12-hour shift has ended. You can only enter readings for your current shift."}
        </div>
      )}

      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
        {locale === "ar"
          ? "الخانات ذات الخلفية الحمراء تعني انحراف القراءة أكثر من ١٠٪ عن متوسط اليوم السابق، ويُرسل إشعار تلقائي لمشرف المحطة والإدارة عند الحفظ للمتابعة."
          : "Cells highlighted in red deviate more than 10% from the previous day's average; an automatic alert is sent to the station supervisor and management on save."}
      </div>




      <div id="readings-print-sheet" className="space-y-5 rounded-xl border bg-card p-4 md:p-6">
        <div className="text-center">
          <h2 className="text-xl font-bold">{locale === "ar" ? template.name_ar : template.name_en}</h2>
          <p className="text-sm text-muted-foreground" dir="ltr">
            {template.code} · {date}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-col gap-1 max-w-sm">
            <label className="text-xs text-muted-foreground">
              {locale === "ar" ? "اسم المشغل" : "Operator name"}
            </label>
            <input
              value={operatorName}
              readOnly
              disabled
              className="h-10 px-3 rounded-lg border bg-muted/40 text-sm cursor-not-allowed"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">
              {locale === "ar"
                ? "اختر الحالة ثم اضغط على خانة الوقت داخل الوحدة لتطبيقها على كامل الوحدة"
                : "Pick a status, then click a time cell inside a unit to apply it to that whole unit"}
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_MARKS.map((m) => (
                <button
                  key={m.code}
                  type="button"
                  disabled={!canWrite}
                  onClick={() => setActiveMark((cur) => (cur === m.code ? null : m.code))}
                  className={`px-3 h-9 rounded-lg border text-sm font-semibold transition disabled:opacity-50 ${m.cls} ${
                    activeMark === m.code ? "ring-2 ring-primary" : ""
                  }`}
                >
                  {locale === "ar" ? m.ar : m.en}
                </button>
              ))}
              {activeMark && (
                <button
                  type="button"
                  onClick={() => setActiveMark(null)}
                  className="px-3 h-9 rounded-lg border text-sm hover:bg-accent"
                >
                  {locale === "ar" ? "إلغاء التحديد" : "Clear selection"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div data-pdf-hide className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-card/95 backdrop-blur border-y flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold shrink-0">
            {locale === "ar" ? "النظام" : "System"}
          </label>
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value)}
            className="flex-1 min-w-[200px] h-10 px-3 rounded-lg border bg-background text-sm font-medium"
          >
            <option value="all">{locale === "ar" ? "كل الأنظمة" : "All systems"}</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {locale === "ar" ? s.name_ar : s.name_en}
              </option>
            ))}
          </select>
        </div>

        {sections.map((sec) => {
        const fs = fieldsBySection[sec.id] ?? [];
        if (fs.length === 0) return null;
        if (activeSection !== "all" && activeSection !== sec.id) return null;
        return (
          <div key={sec.id} className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b bg-primary/10">
              <h2 className="text-base font-bold text-primary uppercase tracking-wide">
                {locale === "ar" ? sec.name_ar : sec.name_en}
              </h2>
            </div>

            <div className="overflow-auto">
              <table className="w-max min-w-full table-fixed text-sm" dir={dir}>
                <thead className="bg-muted/20">
                  <tr>
                    <th className="text-start px-3 py-2 font-medium sticky start-0 bg-muted/40 z-10 w-[230px] min-w-[230px] max-w-[230px]">
                      {locale === "ar" ? "الحقل" : "Field"}
                    </th>
                    {template.time_slots.map((slot) => (
                      <th key={slot} className="w-[86px] min-w-[86px] px-2 py-2 font-medium text-center" dir="ltr">
                        <div>{slot}</div>
                        {slotRecorded[slot] && (
                          <div
                            className={`mt-0.5 text-[10px] font-semibold rounded px-1 ${
                              isLate(slot, slotRecorded[slot])
                                ? "bg-red-100 text-red-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                            title={isLate(slot, slotRecorded[slot]) ? "Late entry" : "On time"}
                          >
                            {fmtLocalTime(slotRecorded[slot])}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fs.map((f, idx) => {
                    const isSubHeader = !f.unit;
                    if (isSubHeader) {
                      return (
                        <tr key={f.id} className="border-t">
                          <td
                            colSpan={template.time_slots.length + 1}
                            className="px-3 py-2 bg-primary/15 font-bold text-primary text-sm uppercase tracking-wide"
                          >
                            {locale === "ar" ? f.label_ar : f.label_en}
                          </td>
                        </tr>
                      );
                    }

                    const firstInputIdx = fs.findIndex((x) => x.unit);
                    const isFirstInputRow = idx === firstInputIdx;

                    return (
                      <tr key={f.id} className="border-t">
                        <td className="px-3 py-1.5 sticky start-0 bg-card z-10 border-e w-[230px] min-w-[230px] max-w-[230px] align-top">
                          <div className="font-medium whitespace-normal break-words leading-snug">
                            {locale === "ar" ? f.label_ar : f.label_en}
                          </div>
                          <div className="mt-1">
                            <span className="text-xs text-muted-foreground" dir="ltr">{f.unit}</span>
                          </div>
                        </td>
                        {template.time_slots.map((slot) => {
                          const key = `${f.id}|${slot}`;
                          const base = baseline?.[f.id];
                          const cellNum = Number(String(values[key] ?? "").trim());
                          const deviated =
                            (values[key] ?? "").trim() !== "" && isDeviating(cellNum, base);
                          return (
                            <td key={slot} className="w-[86px] min-w-[86px] p-1 align-top">

                              <input
                                type="text"
                                inputMode="text"
                                value={values[key] ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setValues((v) => {
                                    const next = { ...v, [key]: val };
                                    if (isFirstInputRow) {
                                      const norm = val.trim().toLowerCase();
                                      const statusWords = ["standby", "stand by", "n/v", "nv", "maintenance", "m", "fixed speed", "f/s", "fs"];
                                      if (statusWords.includes(norm)) {
                                        for (const other of fs) {
                                          if (other.id === f.id) continue;
                                          if (!other.unit) continue;
                                          const k = `${other.id}|${slot}`;
                                          if (!next[k] || next[k].trim() === "") {
                                            next[k] = val;
                                          }
                                        }
                                      }
                                    }
                                    return next;
                                  });
                                }}
                                onKeyDown={(e) => {
                                  const el = e.currentTarget;
                                  const move = (sel: string, step: number) => {
                                    const all = Array.from(
                                      document.querySelectorAll<HTMLInputElement>(`${sel}:not([disabled])`),
                                    );
                                    const i = all.indexOf(el);
                                    const nx = all[i + step];
                                    if (nx) { e.preventDefault(); nx.focus(); nx.select(); }
                                  };
                                  const colSel = `input[data-slot="${slot}"]`;
                                  const rowSel = `input[data-row="${f.id}"]`;
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    move(colSel, e.shiftKey ? -1 : 1);
                                  } else if (e.key === "ArrowDown") {
                                    move(colSel, 1);
                                  } else if (e.key === "ArrowUp") {
                                    move(colSel, -1);
                                  } else if (e.key === "ArrowRight") {
                                    if (el.selectionStart === el.value.length) move(rowSel, 1);
                                  } else if (e.key === "ArrowLeft") {
                                    if (el.selectionStart === 0) move(rowSel, -1);
                                  }
                                }}
                                onMouseDown={(e) => {
                                  if (!activeMark || !cellWritable(slot)) return;
                                  e.preventDefault();
                                  setValues((v) => {
                                    const next = { ...v };
                                    for (const other of fs) {
                                      if (!other.unit) continue;
                                      next[`${other.id}|${slot}`] = activeMark;
                                    }
                                    return next;
                                  });
                                  setActiveMark(null);
                                }}
                                data-slot={slot}
                                data-row={f.id}

                                disabled={!cellWritable(slot)}
                                title={
                                  slotLocked(slot)
                                    ? locale === "ar"
                                      ? "مقفل: انتهت الوردية الخاصة بهذا الوقت"
                                      : "Locked: this shift has ended"
                                    : deviated && base
                                      ? locale === "ar"
                                        ? `انحراف ${deviationPct(cellNum, base).toFixed(1)}٪ عن متوسط أمس (${base.toFixed(2)})`
                                        : `Deviation ${deviationPct(cellNum, base).toFixed(1)}% vs yesterday avg (${base.toFixed(2)})`
                                      : undefined
                                }
                                className={`w-full h-9 px-2 rounded-md border text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                                  slotLocked(slot)
                                    ? "bg-muted/60 cursor-not-allowed"
                                    : deviated
                                      ? "bg-destructive/15 border-destructive/50 text-destructive font-semibold"
                                      : "bg-background"
                                }`}
                                dir="ltr"
                              />



                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}



                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

async function exportReadingsXlsx(opts: {
  locale: "ar" | "en";
  template: Template;
  sections: Section[];
  fieldsBySection: Record<string, Field[]>;
  values: Record<string, string>;
  date: string;
  stationId: string | undefined;
  operatorName: string;
  notes: string;
}) {
  const { locale, template, sections, fieldsBySection, values, date, stationId, operatorName, notes } = opts;
  const ExcelJS = (await import("exceljs")) as any;
  const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook;
  if (!Workbook) throw new Error("Excel engine not loaded");
  const wb = new Workbook();
  wb.creator = "WTCO";
  wb.created = new Date();
  const ws = wb.addWorksheet(template.code || "Readings", {
    views: [{ state: "frozen", ySplit: 5, xSplit: 1, rightToLeft: locale === "ar" }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [{ width: 34 }, ...template.time_slots.map(() => ({ width: 12 }))];
  const lastCol = template.time_slots.length + 1;
  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = locale === "ar" ? template.name_ar : template.name_en;
  ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: "FF1F4E78" } };
  ws.getCell(1, 1).alignment = { horizontal: "center" };
  ws.getCell("A3").value = "Date";
  ws.getCell("B3").value = date;
  ws.getCell("A4").value = "Station";
  ws.getCell("B4").value = stationId || "";
  ws.getCell("D3").value = "Operator";
  ws.getCell("E3").value = operatorName;
  ws.getCell("D4").value = "Notes";
  ws.getCell("E4").value = notes;

  const header = ws.getRow(6);
  header.getCell(1).value = locale === "ar" ? "الحقل" : "Field";
  template.time_slots.forEach((slot, i) => (header.getCell(i + 2).value = slot));
  header.eachCell({ includeEmpty: true }, (cell: any) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });

  let rowNumber = 7;
  for (const section of sections) {
    const fields = fieldsBySection[section.id] ?? [];
    if (fields.length === 0) continue;
    const sectionRow = ws.getRow(rowNumber++);
    sectionRow.getCell(1).value = locale === "ar" ? section.name_ar : section.name_en;
    ws.mergeCells(sectionRow.number, 1, sectionRow.number, lastCol);
    sectionRow.getCell(1).font = { bold: true, color: { argb: "FF1F4E78" } };
    sectionRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF4FB" } };

    for (const field of fields) {
      const row = ws.getRow(rowNumber++);
      row.getCell(1).value = `${locale === "ar" ? field.label_ar : field.label_en}${field.unit ? ` (${field.unit})` : ""}`;
      if (!field.unit) {
        ws.mergeCells(row.number, 1, row.number, lastCol);
        row.getCell(1).font = { bold: true };
        row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      } else {
        template.time_slots.forEach((slot, i) => {
          row.getCell(i + 2).value = values[`${field.id}|${slot}`] ?? "";
        });
      }
      row.eachCell({ includeEmpty: true }, (cell: any) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFBFBFBF" } },
          bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
          left: { style: "thin", color: { argb: "FFBFBFBF" } },
          right: { style: "thin", color: { argb: "FFBFBFBF" } },
        };
        cell.alignment = { vertical: "middle", wrapText: true, horizontal: cell.col === 1 ? "left" : "center" };
      });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = createExcelBlob(buffer);
  return { blob, filename: `Readings_${safeFilePart(template.code)}_${date}.xlsx` };
}

async function exportSelectedReadingsXlsx(opts: {
  locale: "ar" | "en";
  entries: {
    id: string;
    entry_date: string;
    template_id: string;
    station_id: string;
    operator_name: string | null;
    stationCode: string;
    templateName: string;
  }[];
}) {
  const { locale, entries } = opts;
  if (entries.length === 0) throw new Error("No records selected");
  const ids = entries.map((e) => e.id);
  const templateIds = Array.from(new Set(entries.map((e) => e.template_id)));

  const [valsRes, fieldsRes, sectionsRes] = await Promise.all([
    supabase.from("reading_values").select("entry_id, field_id, time_slot, value").in("entry_id", ids),
    supabase
      .from("reading_fields")
      .select("id, template_id, section_id, label_en, label_ar, unit, sort_order")
      .in("template_id", templateIds),
    supabase
      .from("reading_sections")
      .select("id, template_id, name_en, name_ar, sort_order")
      .in("template_id", templateIds),
  ]);
  if (valsRes.error) throw valsRes.error;
  if (fieldsRes.error) throw fieldsRes.error;
  if (sectionsRes.error) throw sectionsRes.error;

  const fields = (fieldsRes.data ?? []) as any[];
  const fieldById = Object.fromEntries(fields.map((f) => [f.id, f]));
  const sectionById = Object.fromEntries((sectionsRes.data ?? []).map((s: any) => [s.id, s]));
  const values = (valsRes.data ?? []) as any[];

  const slots = Array.from(new Set(values.map((v) => v.time_slot))).sort();

  const ExcelJS = (await import("exceljs")) as any;
  const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook;
  if (!Workbook) throw new Error("Excel engine not loaded");
  const wb = new Workbook();
  wb.creator = "WTCO";
  wb.created = new Date();

  const ws = wb.addWorksheet(locale === "ar" ? "القراءات" : "Readings", {
    views: [{ state: "frozen", ySplit: 1, rightToLeft: locale === "ar" }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });

  const headers = [
    locale === "ar" ? "التاريخ" : "Date",
    locale === "ar" ? "المحطة" : "Station",
    locale === "ar" ? "القالب" : "Template",
    locale === "ar" ? "بواسطة" : "By",
    locale === "ar" ? "القسم" : "Section",
    locale === "ar" ? "القراءة" : "Reading",
    locale === "ar" ? "الوحدة" : "Unit",
    ...slots,
  ];
  ws.columns = [
    { width: 12 },
    { width: 12 },
    { width: 24 },
    { width: 18 },
    { width: 24 },
    { width: 34 },
    { width: 10 },
    ...slots.map(() => ({ width: 12 })),
  ];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  for (const entry of entries) {
    const entryValues = values.filter((v) => v.entry_id === entry.id);
    const usedFieldIds = Array.from(new Set(entryValues.map((v) => v.field_id)));
    const rowsFields = usedFieldIds
      .map((id) => fieldById[id])
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const sa = sectionById[a.section_id]?.sort_order ?? 0;
        const sb = sectionById[b.section_id]?.sort_order ?? 0;
        return sa - sb || a.sort_order - b.sort_order;
      });
    for (const f of rowsFields) {
      const sec = sectionById[f.section_id];
      const row = ws.addRow([
        entry.entry_date,
        entry.stationCode,
        entry.templateName,
        entry.operator_name ?? "",
        sec ? (locale === "ar" ? sec.name_ar : sec.name_en) : "",
        locale === "ar" ? f.label_ar || f.label_en : f.label_en,
        f.unit ?? "",
        ...slots.map((s) => {
          const v = entryValues.find((x) => x.field_id === f.id && x.time_slot === s);
          return v?.value ?? "";
        }),
      ]);
      row.eachCell({ includeEmpty: true }, (cell: any) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFBFBFBF" } },
          bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
          left: { style: "thin", color: { argb: "FFBFBFBF" } },
          right: { style: "thin", color: { argb: "FFBFBFBF" } },
        };
        cell.alignment = { vertical: "middle", wrapText: true };
      });
    }
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = createExcelBlob(buffer);
  return { blob, filename: `Readings_List_${safeFilePart(new Date().toISOString().slice(0, 10))}.xlsx` };
}
