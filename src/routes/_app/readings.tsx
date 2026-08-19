import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useScopedStations, useStationScope } from "@/lib/station-scope";
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
  { code: "BUSY", ar: "مشغول", en: "Busy", cls: "bg-blue-100 text-blue-800 border-blue-300" },
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
  onDate,
  onStation,
}: {
  date: string;
  stationId: string | undefined;
  canPickStation: boolean;
  onSelect: (id: string) => void;
  onDate: (d: string) => void;
  onStation: (s: string) => void;
}) {
  const { locale, t, dir } = useI18n();

  const { data: stations } = useScopedStations();

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
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            {t("nav.readings")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar" ? "اختر القالب لإدخال قراءات اليوم" : "Pick a template to enter today's readings"}
          </p>
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

      {!stationId ? (
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
    setValues(v);
    setStatuses(s);
    setNotes(data.entry?.notes ?? "");
    setOperatorName(profile?.full_name ?? data.entry?.operator_name ?? "");
    setHydrated(true);
  }, [data, profile?.full_name]);


  useEffect(() => {
    return () => {
      if (excelDownload) URL.revokeObjectURL(excelDownload.url);
      if (pdfDownload) URL.revokeObjectURL(pdfDownload.url);
    };
  }, [excelDownload, pdfDownload]);

  const save = useMutation({
    mutationFn: async () => {
      if (!stationId) throw new Error("no station");
      // 1) upsert entry
      let entryId = data?.entry?.id;
      if (!entryId) {
        const { data: created, error } = await supabase
          .from("reading_entries")
          .insert({
            template_id: templateId,
            station_id: stationId,
            entry_date: date,
            operator_id: profile?.id,
            operator_name: profile?.full_name ?? operatorName,
            notes: notes || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        entryId = created.id;
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

      const handledKeys = new Set<string>();

      // 1) Fields with a row-level status: emit one row per slot with status token, value null.
      for (const [fieldId, st] of Object.entries(statuses)) {
        if (!st) continue;
        for (const slot of data!.template.time_slots) {
          const key = `${fieldId}|${slot}`;
          handledKeys.add(key);
          toUpsert.push({ entry_id: entryId!, field_id: fieldId, time_slot: slot, value: null, status: st, recorded_at: nowIso });
        }
      }

      // 2) Cells for fields without row status. Numeric → value; text → status.
      for (const [key, raw] of Object.entries(values)) {
        if (handledKeys.has(key)) continue;
        const [field_id, time_slot] = key.split("|");
        if (statuses[field_id]) continue;
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
      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from("reading_values")
          .upsert(toUpsert, { onConflict: "entry_id,field_id,time_slot" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(locale === "ar" ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["reading-entry", templateId, date, stationId ?? "none"] });
      qc.invalidateQueries({ queryKey: ["progress", date, stationId ?? "any"] });
      qc.invalidateQueries({ queryKey: ["dash-stats"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    },
  });

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
                  sections,
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
                                  if (!activeMark || !canWrite) return;
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

                                disabled={!canWrite}
                                className="w-full h-9 px-2 rounded-md border bg-background text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
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
