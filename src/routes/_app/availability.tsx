import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { buildElementPdf, createExcelBlob, safeFilePart, triggerBlobDownload, type DownloadLink } from "@/lib/export-utils";
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Printer,
  Plus,
  Trash2,
  Settings2,
  Activity,
  Pencil,
  FileSpreadsheet,
} from "lucide-react";
import { z } from "zod";
// ExcelJS, jsPDF and html2canvas are imported dynamically inside the export functions.

const searchSchema = z.object({
  id: z.string().optional(),
  manage: z.string().optional(),
});

export const Route = createFileRoute("/_app/availability")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Unified MDR Daily Report | URSAND" },
      { name: "description", content: "Create, update, and export the unified daily pumping stations status report." },
      { property: "og:title", content: "Unified MDR Daily Report | URSAND" },
      { property: "og:description", content: "Unified daily pumping stations status report for all lines and stations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AvailabilityPage,
});

type EqStatus =
  | "in_service"
  | "standby"
  | "out_of_service"
  | "emergency_standby"
  | "standby_fixed_speed"
  | "in_service_fixed_speed"
  | "running_on_emergency";


interface Station {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
}

interface Equipment {
  id: string;
  station_id: string;
  code: string;
  name_en: string;
  name_ar: string;
  sort_order: number;
  active: boolean;
}

interface Entry {
  id: string;
  station_id: string;
  entry_date: string;
  notes: string | null;
  operator_id: string | null;
  operator_name: string | null;
  shift: string | null;
  supervisor_name: string | null;
  supervisor_id: string | null;
  report_status: string | null;
  created_at: string;
}

interface ValueRow {
  id: string;
  entry_id: string;
  equipment_id: string;
  status: EqStatus;
  remark: string | null;
  problem_description: string | null;
  work_notification: string | null;
  work_center: string | null;
  notification_date: string | null;
  ets: string | null;
}

interface ValueDraft {
  status: EqStatus;
  problem_description: string;
  work_notification: string;
  work_center: string;
  notification_date: string;
  ets: string;
}

function emptyDraft(): ValueDraft {
  return {
    status: "in_service",
    problem_description: "",
    work_notification: "",
    work_center: "",
    notification_date: "",
    ets: "",
  };
}

const STATUS_LIST: EqStatus[] = [
  "in_service",
  "standby",
  "out_of_service",
  "emergency_standby",
  "standby_fixed_speed",
  "in_service_fixed_speed",
  "running_on_emergency",
];

// Statuses that should be auto-propagated across the same unit group
const AUTOFILL_STATUSES: EqStatus[] = ["standby", "out_of_service", "emergency_standby"];

function statusLabel(s: EqStatus, locale: "ar" | "en") {
  const map: Record<EqStatus, { ar: string; en: string }> = {
    in_service: { ar: "في الخدمة", en: "IN SERVICE" },
    standby: { ar: "احتياطي", en: "ON STANDBY" },
    out_of_service: { ar: "خارج الخدمة", en: "OUT OF SERVICE" },
    emergency_standby: { ar: "احتياطي طوارئ", en: "EMERGENCY STANDBY" },
    standby_fixed_speed: { ar: "احتياطي - سرعة ثابتة", en: "STANDBY ON FIXED SPEED" },
    in_service_fixed_speed: { ar: "في الخدمة - سرعة ثابتة", en: "IN SERVICE ON FIXED SPEED" },
    running_on_emergency: { ar: "يعمل على الطوارئ", en: "RUNNING ON EMERGENCY" },
  };
  return map[s][locale];
}

function statusShort(s: EqStatus): string {
  switch (s) {
    case "in_service": return "IS";
    case "standby": return "S/B";
    case "out_of_service": return "OOS";
    case "emergency_standby": return "E/SB";
    case "standby_fixed_speed": return "SB/FS";
    case "in_service_fixed_speed": return "IS/FS";
    case "running_on_emergency": return "R/EM";
  }
}

function statusColor(s: EqStatus): string {
  switch (s) {
    case "in_service":
    case "standby":
      return "bg-white text-slate-800 border-slate-300";
    case "out_of_service":
      return "bg-yellow-300 text-yellow-900 border-yellow-500";
    case "emergency_standby":
    case "running_on_emergency":
      return "bg-red-200 text-red-900 border-red-400";
    case "standby_fixed_speed":
    case "in_service_fixed_speed":
      return "bg-amber-200 text-amber-900 border-amber-400";
  }
}



// Determine the group prefix of an equipment code — used for auto-fill scope.
// Example: "M.U-1A" -> "M.U-*A" (Main Unit line A); "B.P-5B" -> "B.P-*B"
function unitGroupKey(code: string): string {
  const m = code.match(/^([A-Za-z.]+)-\d+([A-Za-z]*)$/);
  if (!m) return code.replace(/\d+/g, "");
  return `${m[1]}-*${m[2]}`;
}


function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function AvailabilityPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/availability" });

  if (search.manage) {
    return <EquipmentManager stationId={search.manage} onBack={() => navigate({ search: {}, replace: false })} />;
  }
  if (search.id === "unified") {
    return <UnifiedMdrEditor onBack={() => navigate({ search: {}, replace: false })} />;
  }
  if (search.id) {
    return <EditorView id={search.id} onBack={() => navigate({ search: {}, replace: false })} />;
  }
  return (
    <ListView
      onNew={() => navigate({ search: { id: "new" }, replace: false })}
      onOpen={(id) => navigate({ search: { id }, replace: false })}
      onManage={(stationId) => navigate({ search: { manage: stationId }, replace: false })}
    />
  );
}

/* ============================ LIST ============================ */

function ListView({
  onNew,
  onOpen,
  onManage,
}: {
  onNew: () => void;
  onOpen: (id: string) => void;
  onManage: (stationId: string) => void;
}) {
  const { locale, t } = useI18n();
  const { profile, isAdmin, hasRole } = useAuth();
  const qc = useQueryClient();
  const canFilterStation = isAdmin || hasRole("supervisor") || hasRole("viewer");
  const canManage = isAdmin || hasRole("supervisor");
  const [stationFilter, setStationFilter] = useState<string>(profile?.station_id ?? "");
  const [combinedDate, setCombinedDate] = useState<string>(todayISO());
  const [combinedDownload, setCombinedDownload] = useState<DownloadLink | null>(null);
  const [combinedBusy, setCombinedBusy] = useState(false);
  useEffect(() => () => { if (combinedDownload) URL.revokeObjectURL(combinedDownload.url); }, [combinedDownload]);

  const { data: stations } = useQuery({
    queryKey: ["stations", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("id, code, name_en, name_ar")
        .eq("active", true)
        .order("code");
      if (error) throw error;
      return data as Station[];
    },
  });

  const { data: entries, isLoading } = useQuery({
    queryKey: ["availability-entries", stationFilter || "all"],
    queryFn: async () => {
      let q = supabase
        .from("equipment_availability_entries")
        .select("*")
        .order("entry_date", { ascending: false })
        .limit(100);
      if (stationFilter) q = q.eq("station_id", stationFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
  });

  const stationMap = useMemo(() => {
    const m: Record<string, Station> = {};
    for (const s of stations ?? []) m[s.id] = s;
    return m;
  }, [stations]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("equipment_availability_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(locale === "ar" ? "تم الحذف" : "Deleted");
      qc.invalidateQueries({ queryKey: ["availability-entries"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            {locale === "ar" ? "تقرير MDR اليومي الموحّد" : "Unified Daily MDR"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? "ملف واحد يضم جميع الخطوط والمحطات والوحدات بالترتيب الرسمي"
              : "One report containing every line, station, and unit in the official order"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && stationFilter && (
            <button
              onClick={() => onManage(stationFilter)}
              className="inline-flex items-center gap-2 h-10 px-3 rounded-lg border text-sm hover:bg-accent"
            >
              <Settings2 className="h-4 w-4" />
              {locale === "ar" ? "قائمة المعدات" : "Equipment List"}
            </button>
          )}
          <button
            onClick={onNew}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            {locale === "ar" ? "إنشاء MDR موحّد" : "Create Unified MDR"}
          </button>
        </div>
      </div>

      {/* Combined MDR export */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {locale === "ar" ? "تاريخ التقرير الموحّد" : "Combined report date"}
          </label>
          <input
            type="date"
            value={combinedDate}
            onChange={(e) => setCombinedDate(e.target.value)}
            className="h-10 px-3 rounded-lg border bg-background text-sm"
            dir="ltr"
          />
        </div>
        <button
          disabled={combinedBusy}
          onClick={async () => {
            try {
              setCombinedBusy(true);
              const file = await exportCombinedAvailabilityXlsx({ locale, date: combinedDate });
              const link = await triggerBlobDownload(file.blob, file.filename);
              setCombinedDownload((p) => { if (p) URL.revokeObjectURL(p.url); return link; });
              toast.success(locale === "ar" ? "تم تجهيز الملف الموحّد" : "Combined file ready");
            } catch (err) {
              console.error(err);
              toast.error((locale === "ar" ? "فشل التصدير: " : "Export failed: ") + ((err as Error)?.message || String(err)));
            } finally {
              setCombinedBusy(false);
            }
          }}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <FileSpreadsheet className="h-4 w-4" />
          {combinedBusy
            ? (locale === "ar" ? "جارٍ التجهيز…" : "Preparing…")
            : (locale === "ar" ? "تصدير Excel موحّد لكل المحطات" : "Export Combined MDR (All Stations)")}
        </button>
        {combinedDownload && (
          <a
            href={combinedDownload.url}
            download={combinedDownload.filename}
            rel="noreferrer"
            className="inline-flex items-center gap-2 h-10 px-3 rounded-lg border border-primary text-primary text-sm hover:bg-accent"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {locale === "ar" ? "تحميل الملف" : "Download file"}
          </a>
        )}
      </div>

      {canFilterStation && (
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs text-muted-foreground">{t("common.station")}</label>
            <select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              className="h-10 px-3 rounded-lg border bg-background text-sm"
            >
              <option value="">{locale === "ar" ? "كل المحطات" : "All stations"}</option>
              {(stations ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {locale === "ar" ? s.name_ar : s.name_en}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : (entries ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {locale === "ar" ? "لا توجد تقارير بعد" : "No reports yet"}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-start px-3 py-2 font-medium">{t("common.date")}</th>
                <th className="text-start px-3 py-2 font-medium">{t("common.station")}</th>
                <th className="text-start px-3 py-2 font-medium">
                  {locale === "ar" ? "بواسطة" : "By"}
                </th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((r) => {
                const s = stationMap[r.station_id];
                return (
                  <tr
                    key={r.id}
                    className="border-t hover:bg-muted/20 cursor-pointer"
                    onClick={() => onOpen(r.id)}
                  >
                    <td className="px-3 py-2" dir="ltr">
                      {r.entry_date}
                    </td>
                    <td className="px-3 py-2">
                      {s ? `${s.code} · ${locale === "ar" ? s.name_ar : s.name_en}` : "—"}
                    </td>
                    <td className="px-3 py-2">{r.operator_name ?? "—"}</td>
                    <td className="px-3 py-2 text-end">
                      {(isAdmin || hasRole("supervisor")) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(locale === "ar" ? "حذف التقرير؟" : "Delete report?"))
                              del.mutate(r.id);
                          }}
                          className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                          aria-label="delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================ EDITOR ============================ */

function EditorView({ id, onBack }: { id: string; onBack: () => void }) {
  const { locale, dir, t } = useI18n();
  const { profile, isAdmin, hasRole } = useAuth();
  const qc = useQueryClient();
  const isNew = id === "new";
  const canWrite = isAdmin || hasRole("supervisor") || hasRole("operator");

  const { data: stations } = useQuery({
    queryKey: ["stations", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("id, code, name_en, name_ar")
        .eq("active", true)
        .order("code");
      if (error) throw error;
      return data as Station[];
    },
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ["availability-entry", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_availability_entries")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as Entry;
    },
  });

  const { data: existingValues } = useQuery({
    queryKey: ["availability-values", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_availability_values")
        .select("*")
        .eq("entry_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as ValueRow[];
    },
  });

  const [stationId, setStationId] = useState<string>(profile?.station_id ?? "");
  const [entryDate, setEntryDate] = useState<string>(todayISO());
  const [operatorName, setOperatorName] = useState<string>("");
  const [supervisorName, setSupervisorName] = useState<string>("");
  const [shift, setShift] = useState<string>("day");
  const [notes, setNotes] = useState<string>("");
  const [values, setValues] = useState<Record<string, ValueDraft>>({});
  const [excelDownload, setExcelDownload] = useState<DownloadLink | null>(null);
  const [pdfDownload, setPdfDownload] = useState<DownloadLink | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const { data: equipment } = useQuery({
    queryKey: ["station-equipment", stationId],
    enabled: !!stationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("station_equipment")
        .select("*")
        .eq("station_id", stationId)
        .eq("active", true)
        .order("sort_order")
        .order("code");
      if (error) throw error;
      return (data ?? []) as unknown as Equipment[];
    },
  });

  const stationMap = useMemo(() => {
    const m: Record<string, Station> = {};
    for (const s of stations ?? []) m[s.id] = s;
    return m;
  }, [stations]);

  // Hydrate from existing entry
  useEffect(() => {
    if (isNew) {
      setStationId(profile?.station_id ?? "");
      setOperatorName((n) => n || profile?.full_name || "");
      setHydrated(true);
      return;
    }
    if (!existing) return;
    setStationId(existing.station_id);
    setEntryDate(existing.entry_date);
    setOperatorName(existing.operator_name ?? "");
    setSupervisorName(existing.supervisor_name ?? "");
    setShift(existing.shift ?? "day");
    setNotes(existing.notes ?? "");
    setHydrated(true);
  }, [isNew, existing, profile?.station_id, profile?.full_name]);

  // Merge existing values once available
  useEffect(() => {
    if (!existingValues) return;
    const next: Record<string, ValueDraft> = {};
    for (const v of existingValues) {
      next[v.equipment_id] = {
        status: v.status,
        problem_description: v.problem_description ?? v.remark ?? "",
        work_notification: v.work_notification ?? "",
        work_center: v.work_center ?? "",
        notification_date: v.notification_date ?? "",
        ets: v.ets ?? "",
      };
    }
    setValues((prev) => ({ ...next, ...prev }));
  }, [existingValues]);

  // Default new equipment to in_service
  useEffect(() => {
    if (!equipment) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const e of equipment) {
        if (!next[e.id]) next[e.id] = emptyDraft();
      }
      return next;
    });
  }, [equipment]);

  useEffect(() => {
    return () => {
      if (excelDownload) URL.revokeObjectURL(excelDownload.url);
      if (pdfDownload) URL.revokeObjectURL(pdfDownload.url);
    };
  }, [excelDownload, pdfDownload]);

  const save = useMutation({
    mutationFn: async () => {
      if (!stationId) throw new Error(locale === "ar" ? "اختر المحطة" : "Pick a station");
      if (!equipment || equipment.length === 0)
        throw new Error(
          locale === "ar"
            ? "لا توجد معدات مسجّلة لهذه المحطة. أضفها من قائمة المعدات."
            : "No equipment defined for this station. Add via Equipment List.",
        );

      let entryId = isNew ? "" : id;
      const entryPayload = {
        station_id: stationId,
        entry_date: entryDate,
        notes: notes || null,
        operator_name: operatorName || null,
        supervisor_name: supervisorName || null,
        shift: shift || null,
      };
      if (isNew) {
        const { data, error } = await supabase
          .from("equipment_availability_entries")
          .insert({ ...entryPayload, operator_id: profile?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        entryId = data.id as string;
      } else {
        const { error } = await supabase
          .from("equipment_availability_entries")
          .update(entryPayload)
          .eq("id", id);
        if (error) throw error;
      }

      const rows = equipment.map((e) => {
        const v = values[e.id] ?? emptyDraft();
        return {
          entry_id: entryId,
          equipment_id: e.id,
          status: v.status,
          remark: v.problem_description || null,
          problem_description: v.problem_description || null,
          work_notification: v.work_notification || null,
          work_center: v.work_center || null,
          notification_date: v.notification_date || null,
          ets: v.ets || null,
        };
      });
      const { error: vErr } = await supabase
        .from("equipment_availability_values")
        .upsert(rows, { onConflict: "entry_id,equipment_id" });
      if (vErr) throw vErr;
      return entryId;
    },
    onSuccess: (newId) => {
      toast.success(locale === "ar" ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["availability-entries"] });
      qc.invalidateQueries({ queryKey: ["availability-entry", newId] });
      qc.invalidateQueries({ queryKey: ["availability-values", newId] });
      if (isNew) window.history.replaceState({}, "", `?id=${newId}`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const station = stationMap[stationId];
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  if (!isNew && (isLoading || !hydrated)) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-primary">
          <Back className="h-4 w-4" /> {locale === "ar" ? "رجوع" : "Back"}
        </button>
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  // Summary counts
  const counts: Record<EqStatus, number> = {
    in_service: 0,
    standby: 0,
    out_of_service: 0,
    emergency_standby: 0,
    standby_fixed_speed: 0,
    in_service_fixed_speed: 0,
    running_on_emergency: 0,
  };

  for (const e of equipment ?? []) {
    const s = values[e.id]?.status ?? "in_service";
    counts[s] = (counts[s] ?? 0) + 1;
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent"
        >
          <Back className="h-4 w-4" /> {locale === "ar" ? "رجوع" : "Back"}
        </button>
        <div className="flex-1" />
        <button
          onClick={async () => {
            try {
              const file = await buildElementPdf({
                elementId: "availability-print-sheet",
                filename: `Daily_Availability_${safeFilePart(station?.code)}_${entryDate}.pdf`,
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
              const file = await exportAvailabilityXlsx({
                locale,
                station: station ?? null,
                entryDate,
                operatorName,
                notes,
                equipment: equipment ?? [],
                values,
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
          disabled={!stationId}
          className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent disabled:opacity-50"
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

      {/* Meta */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("common.station")}</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            disabled={!canWrite || !isNew}
            className="h-10 px-3 rounded-lg border bg-background text-sm"
          >
            <option value="">{locale === "ar" ? "— اختر —" : "— Pick —"}</option>
            {(stations ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {locale === "ar" ? s.name_ar : s.name_en}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("common.date")}</label>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            disabled={!canWrite}
            className="h-10 px-3 rounded-lg border bg-background text-sm"
            dir="ltr"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {locale === "ar" ? "الشفت" : "Shift"}
          </label>
          <select
            value={shift}
            onChange={(e) => setShift(e.target.value)}
            disabled={!canWrite}
            className="h-10 px-3 rounded-lg border bg-background text-sm"
          >
            <option value="day">{locale === "ar" ? "نهاري (07:00 - 19:00)" : "Day (07:00 - 19:00)"}</option>
            <option value="night">{locale === "ar" ? "ليلي (19:00 - 07:00)" : "Night (19:00 - 07:00)"}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {locale === "ar" ? "المشغل" : "Operator"}
          </label>
          <input
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            disabled={!canWrite}
            className="h-10 px-3 rounded-lg border bg-background text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {locale === "ar" ? "المشرف" : "Supervisor"}
          </label>
          <input
            value={supervisorName}
            onChange={(e) => setSupervisorName(e.target.value)}
            disabled={!canWrite}
            className="h-10 px-3 rounded-lg border bg-background text-sm"
          />
        </div>
      </div>

      {/* Printable sheet */}
      <div
        id="availability-print-sheet"
        className="rounded-xl border bg-card p-6 md:p-8 print:border-0 print:shadow-none print:rounded-none print:p-0"
      >
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold">
            {locale === "ar" ? "التقرير الصباحي اليومي" : "Morning Daily Report (MDR)"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {station
              ? `${station.code} · ${locale === "ar" ? station.name_ar : station.name_en}`
              : "—"}{" "}
            · <span dir="ltr">{entryDate}</span>
          </p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          {STATUS_LIST.map((s) => (
            <div key={s} className={`rounded-lg border px-3 py-2 text-sm ${statusColor(s)}`}>
              <div className="text-xs opacity-80">{statusLabel(s, locale)}</div>
              <div className="text-lg font-bold">{counts[s]}</div>
            </div>
          ))}
        </div>

        {/* Equipment table */}
        {!stationId ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            {locale === "ar" ? "اختر المحطة أولاً" : "Pick a station first"}
          </div>
        ) : (equipment ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            {locale === "ar"
              ? "لا توجد معدات مسجّلة. أضفها من زر (قائمة المعدات) في الصفحة الرئيسية."
              : "No equipment defined. Add via Equipment List on the main page."}
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-primary/10 text-primary">
                <tr>
                  <th className="text-start px-2 py-2 font-semibold w-28">
                    {locale === "ar" ? "رقم المضخة" : "Pump No."}
                  </th>
                  <th className="text-start px-2 py-2 font-semibold">
                    {locale === "ar" ? "وصف المشكلة" : "Problem Description"}
                  </th>
                  <th className="text-start px-2 py-2 font-semibold w-40">
                    {locale === "ar" ? "الحالة" : "Unit Status"}
                  </th>
                  <th className="text-start px-2 py-2 font-semibold w-36">
                    {locale === "ar" ? "رقم الإشعار" : "W. Notification"}
                  </th>
                  <th className="text-start px-2 py-2 font-semibold w-28">
                    {locale === "ar" ? "مركز العمل" : "Work Center"}
                  </th>
                  <th className="text-start px-2 py-2 font-semibold w-36">
                    {locale === "ar" ? "التاريخ" : "Date"}
                  </th>
                  <th className="text-start px-2 py-2 font-semibold w-28">ETS</th>
                </tr>
              </thead>
              <tbody>
                {(equipment ?? []).map((e, idx) => {
                  const v = values[e.id] ?? emptyDraft();
                  const group = unitGroupKey(e.code);
                  // Find the first item of this group in the equipment array — auto-fill only fires from that row.
                  const isGroupLeader =
                    (equipment ?? []).findIndex((x) => unitGroupKey(x.code) === group) === idx;
                  const update = (patch: Partial<ValueDraft>) =>
                    setValues((prev) => ({ ...prev, [e.id]: { ...(prev[e.id] ?? v), ...patch } }));
                  const setStatus = (newStatus: EqStatus) => {
                    setValues((prev) => {
                      const next: Record<string, ValueDraft> = { ...prev, [e.id]: { ...(prev[e.id] ?? v), status: newStatus } };
                      // Auto-fill sibling units in the same group when the group leader picks a propagating status.
                      if (isGroupLeader && AUTOFILL_STATUSES.includes(newStatus)) {
                        for (const other of equipment ?? []) {
                          if (other.id === e.id) continue;
                          if (unitGroupKey(other.code) !== group) continue;
                          const cur = prev[other.id] ?? emptyDraft();
                          if (cur.status === "in_service") {
                            next[other.id] = { ...cur, status: newStatus };
                          }
                        }
                      }
                      return next;
                    });
                  };
                  return (
                    <tr key={e.id} className="border-t align-top">
                      <td className="px-2 py-2 font-semibold whitespace-nowrap">{e.code}</td>
                      <td className="px-2 py-2">
                        <input
                          value={v.problem_description}
                          onChange={(ev) => update({ problem_description: ev.target.value })}
                          disabled={!canWrite}
                          placeholder="—"
                          className="h-9 px-2 rounded-md border bg-background text-sm w-full print:border-0 print:px-0"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="print:hidden">
                          <select
                            value={v.status}
                            onChange={(ev) => setStatus(ev.target.value as EqStatus)}
                            disabled={!canWrite}
                            title={statusLabel(v.status, locale)}
                            className={`h-9 px-2 rounded-md border text-sm w-full ${statusColor(v.status)}`}
                          >
                            {STATUS_LIST.map((s) => (
                              <option key={s} value={s}>
                                {statusShort(s)} — {statusLabel(s, locale)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <span
                          className={`hidden print:inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${statusColor(v.status)}`}
                        >
                          {statusShort(v.status)}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={v.work_notification}
                          onChange={(ev) => update({ work_notification: ev.target.value })}
                          disabled={!canWrite}
                          placeholder="—"
                          dir="ltr"
                          className="h-9 px-2 rounded-md border bg-background text-sm w-full print:border-0 print:px-0"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={v.work_center}
                          onChange={(ev) => update({ work_center: ev.target.value })}
                          disabled={!canWrite}
                          placeholder="IMD/EMD/MMD"
                          className="h-9 px-2 rounded-md border bg-background text-sm w-full print:border-0 print:px-0"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          value={v.notification_date}
                          onChange={(ev) => update({ notification_date: ev.target.value })}
                          disabled={!canWrite}
                          dir="ltr"
                          className="h-9 px-2 rounded-md border bg-background text-sm w-full print:border-0 print:px-0"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={v.ets}
                          onChange={(ev) => update({ ets: ev.target.value })}
                          disabled={!canWrite}
                          placeholder="—"
                          className="h-9 px-2 rounded-md border bg-background text-sm w-full print:border-0 print:px-0"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Notes */}
        <div className="mt-5">
          <label className="text-xs text-muted-foreground">
            {locale === "ar" ? "ملاحظات عامة" : "General notes"}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canWrite}
            rows={4}
            className="mt-1 w-full rounded-lg border bg-background text-sm p-3 print:border-0 print:p-0"
            placeholder={locale === "ar" ? "—" : "—"}
          />
        </div>

        <div className="mt-8 text-sm">
          <span className="text-muted-foreground">
            {locale === "ar" ? "بواسطة:" : "Reported by:"}
          </span>{" "}
          <span className="font-medium">{operatorName || "—"}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================ EQUIPMENT MANAGER ============================ */

function EquipmentManager({ stationId, onBack }: { stationId: string; onBack: () => void }) {
  const { locale, dir, t } = useI18n();
  const { isAdmin, hasRole } = useAuth();
  const qc = useQueryClient();
  const canManage = isAdmin || hasRole("supervisor");
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  const { data: station } = useQuery({
    queryKey: ["station", stationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("id, code, name_en, name_ar")
        .eq("id", stationId)
        .single();
      if (error) throw error;
      return data as Station;
    },
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["station-equipment-all", stationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("station_equipment")
        .select("*")
        .eq("station_id", stationId)
        .order("sort_order")
        .order("code");
      if (error) throw error;
      return (data ?? []) as unknown as Equipment[];
    },
  });

  const [editing, setEditing] = useState<Partial<Equipment> | null>(null);

  const upsert = useMutation({
    mutationFn: async (e: Partial<Equipment>) => {
      const payload = {
        station_id: stationId,
        code: e.code!,
        name_en: e.name_en!,
        name_ar: e.name_ar!,
        sort_order: e.sort_order ?? 0,
        active: e.active ?? true,
      };
      if (e.id) {
        const { error } = await supabase.from("station_equipment").update(payload).eq("id", e.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("station_equipment").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(locale === "ar" ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["station-equipment-all", stationId] });
      qc.invalidateQueries({ queryKey: ["station-equipment", stationId] });
      setEditing(null);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("station_equipment").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(locale === "ar" ? "تم الحذف" : "Deleted");
      qc.invalidateQueries({ queryKey: ["station-equipment-all", stationId] });
      qc.invalidateQueries({ queryKey: ["station-equipment", stationId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent"
        >
          <Back className="h-4 w-4" /> {locale === "ar" ? "رجوع" : "Back"}
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            {locale === "ar" ? "قائمة معدات المحطة" : "Station Equipment List"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {station
              ? `${station.code} · ${locale === "ar" ? station.name_ar : station.name_en}`
              : "—"}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setEditing({ sort_order: (items?.length ?? 0) + 1, active: true })}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            {t("common.add")}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : (items ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {locale === "ar" ? "لا توجد معدات بعد" : "No equipment yet"}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-start px-3 py-2 font-medium w-16">#</th>
                <th className="text-start px-3 py-2 font-medium">
                  {locale === "ar" ? "الكود" : "Code"}
                </th>
                <th className="text-start px-3 py-2 font-medium">
                  {locale === "ar" ? "الاسم بالعربي" : "Name (AR)"}
                </th>
                <th className="text-start px-3 py-2 font-medium">
                  {locale === "ar" ? "الاسم بالإنجليزي" : "Name (EN)"}
                </th>
                <th className="text-start px-3 py-2 font-medium w-20">
                  {locale === "ar" ? "مفعّل" : "Active"}
                </th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((e, i) => (
                <tr key={e.id} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground">{e.sort_order || i + 1}</td>
                  <td className="px-3 py-2 font-medium">{e.code}</td>
                  <td className="px-3 py-2">{e.name_ar}</td>
                  <td className="px-3 py-2">{e.name_en}</td>
                  <td className="px-3 py-2">
                    {e.active ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-end">
                    {canManage && (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setEditing(e)}
                          className="p-1.5 rounded hover:bg-accent"
                          aria-label="edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(locale === "ar" ? "حذف المعدة؟" : "Delete equipment?"))
                              del.mutate(e.id);
                          }}
                          className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                          aria-label="delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-xl border shadow-lg w-full max-w-md p-5 space-y-3">
            <h3 className="font-bold text-lg">
              {editing.id
                ? locale === "ar"
                  ? "تعديل معدة"
                  : "Edit equipment"
                : locale === "ar"
                  ? "إضافة معدة"
                  : "Add equipment"}
            </h3>
            <div className="grid gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {locale === "ar" ? "الكود" : "Code"}
                </label>
                <input
                  value={editing.code ?? ""}
                  onChange={(e) => setEditing((s) => ({ ...s!, code: e.target.value }))}
                  className="h-10 px-3 rounded-lg border bg-background text-sm"
                  placeholder="P-01"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {locale === "ar" ? "الاسم بالعربي" : "Name (AR)"}
                </label>
                <input
                  value={editing.name_ar ?? ""}
                  onChange={(e) => setEditing((s) => ({ ...s!, name_ar: e.target.value }))}
                  className="h-10 px-3 rounded-lg border bg-background text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {locale === "ar" ? "الاسم بالإنجليزي" : "Name (EN)"}
                </label>
                <input
                  value={editing.name_en ?? ""}
                  onChange={(e) => setEditing((s) => ({ ...s!, name_en: e.target.value }))}
                  className="h-10 px-3 rounded-lg border bg-background text-sm"
                  dir="ltr"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">
                    {locale === "ar" ? "الترتيب" : "Order"}
                  </label>
                  <input
                    type="number"
                    value={editing.sort_order ?? 0}
                    onChange={(e) =>
                      setEditing((s) => ({ ...s!, sort_order: Number(e.target.value) }))
                    }
                    className="h-10 px-3 rounded-lg border bg-background text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 mt-6">
                  <input
                    type="checkbox"
                    checked={editing.active ?? true}
                    onChange={(e) => setEditing((s) => ({ ...s!, active: e.target.checked }))}
                  />
                  <span className="text-sm">{locale === "ar" ? "مفعّل" : "Active"}</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditing(null)}
                className="h-9 px-4 rounded-lg border text-sm hover:bg-accent"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  if (!editing.code || !editing.name_ar || !editing.name_en) {
                    toast.error(locale === "ar" ? "أكمل الحقول" : "Fill all fields");
                    return;
                  }
                  upsert.mutate(editing);
                }}
                disabled={upsert.isPending}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50"
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ XLSX EXPORT ============================ */

function xlsxStatusLabel(s: EqStatus): string {
  switch (s) {
    case "in_service": return "IN SERVICE";
    case "standby": return "ON STANDBY";
    case "out_of_service": return "OUT OF SERVICE";
    case "emergency_standby": return "EMERGENCY STANDBY";
    case "standby_fixed_speed": return "STANDBY ON FIXED SPEED";
    case "in_service_fixed_speed": return "IN SERVICE ON FIXED SPEED";
    case "running_on_emergency": return "RUNNING ON EMERGENCY";
  }
}

function xlsxStatusFill(s: EqStatus): string {
  switch (s) {
    case "in_service":
    case "standby":
      return "FFFFFFFF";
    case "out_of_service":
      return "FFFFFF00";
    case "emergency_standby":
    case "running_on_emergency":
      return "FFFFC7CE";
    case "standby_fixed_speed":
    case "in_service_fixed_speed":
      return "FFFFEB9C";
  }
}


async function exportAvailabilityXlsx(opts: {
  locale: "ar" | "en";
  station: Station | null;
  entryDate: string;
  operatorName: string;
  notes: string;
  equipment: Equipment[];
  values: Record<string, ValueDraft>;
}) {
  const { locale, station, entryDate, operatorName, notes, equipment, values } = opts;
  const ExcelJS = (await import("exceljs")) as any;
  const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook;
  if (!Workbook) throw new Error("Excel engine not loaded");
  const wb = new Workbook();
  wb.creator = "WTCO";
  wb.created = new Date();
  const stationLabel = station
    ? `${station.code} - ${locale === "ar" ? station.name_ar : station.name_en}`
    : "";
  const ws = wb.addWorksheet(station?.code || "Report", {
    views: [{ state: "frozen", ySplit: 6, rightToLeft: locale === "ar" }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });

  ws.columns = [
    { width: 14 }, // Pump No.
    { width: 50 }, // Problem Description
    { width: 22 }, // Unit Status
    { width: 18 }, // W. Notification
    { width: 14 }, // Work Center
    { width: 14 }, // Date
    { width: 14 }, // ETS
  ];

  // Title
  ws.mergeCells("A1:G1");
  const t1 = ws.getCell("A1");
  t1.value = "JUBAIL WATER TRANSMISSION SYSTEM";
  t1.font = { bold: true, size: 14, color: { argb: "FF1F4E78" } };
  t1.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;

  ws.mergeCells("A2:G2");
  const t2 = ws.getCell("A2");
  t2.value = "DAILY REPORT OF PUMPING STATIONS STATUS";
  t2.font = { bold: true, size: 12, color: { argb: "FF1F4E78" } };
  t2.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 20;

  // Meta
  ws.getCell("A4").value = "STATION";
  ws.getCell("A4").font = { bold: true };
  ws.mergeCells("B4:D4");
  ws.getCell("B4").value = stationLabel;
  ws.getCell("E4").value = "DATE";
  ws.getCell("E4").font = { bold: true };
  ws.mergeCells("F4:G4");
  ws.getCell("F4").value = entryDate;
  ws.getCell("F4").alignment = { horizontal: "left" };

  // Header row (row 6)
  const headers = [
    "Pump No.",
    "Problem Description",
    "Unit Status",
    "W. Notification",
    "Work Center",
    "Date",
    "ETS",
  ];
  const headerRow = ws.getRow(6);
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });
  headerRow.height = 22;

  // Data rows
  let r = 7;
  for (const e of equipment) {
    const v = values[e.id];
    const status = (v?.status ?? "in_service") as EqStatus;
    const row = ws.getRow(r++);
    row.values = [
      e.code,
      v?.problem_description ?? "",
      xlsxStatusLabel(status),
      v?.work_notification ?? "",
      v?.work_center ?? "",
      v?.notification_date ?? "",
      v?.ets ?? "",
    ];
    row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFBFBFBF" } },
        bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
        left: { style: "thin", color: { argb: "FFBFBFBF" } },
        right: { style: "thin", color: { argb: "FFBFBFBF" } },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (colNumber === 1) cell.font = { bold: true };
      if (colNumber === 3) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: xlsxStatusFill(status) },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.font = { bold: true };
      }
    });
  }

  // Data validation for the Status column (dropdown list)
  const lastRow = r - 1;
  if (lastRow >= 7) {
    for (let i = 7; i <= lastRow; i++) {
      ws.getCell(`C${i}`).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: ['"IN SERVICE,ON STANDBY,OUT OF SERVICE,STANDBY ON FIXED SPEED"'],
      };
    }
  }

  // Notes
  const notesRow = lastRow + 2;
  ws.getCell(`A${notesRow}`).value = "Notes:";
  ws.getCell(`A${notesRow}`).font = { bold: true };
  ws.mergeCells(`B${notesRow}:G${notesRow}`);
  ws.getCell(`B${notesRow}`).value = notes || "";
  ws.getCell(`B${notesRow}`).alignment = { wrapText: true, vertical: "top" };
  ws.getRow(notesRow).height = 40;

  const byRow = notesRow + 1;
  ws.getCell(`A${byRow}`).value = "Reported by:";
  ws.getCell(`A${byRow}`).font = { bold: true };
  ws.getCell(`B${byRow}`).value = operatorName || "";

  // Legend
  const legendRow = byRow + 2;
  const legends: { label: string; s: EqStatus }[] = [
    { label: "IN SERVICE", s: "in_service" },
    { label: "ON STANDBY", s: "standby" },
    { label: "OUT OF SERVICE", s: "out_of_service" },
    { label: "EMERGENCY STANDBY", s: "emergency_standby" },
    { label: "STANDBY ON FIXED SPEED", s: "standby_fixed_speed" },
    { label: "IN SERVICE ON FIXED SPEED", s: "in_service_fixed_speed" },
    { label: "RUNNING ON EMERGENCY", s: "running_on_emergency" },
  ];
  legends.forEach((l, i) => {
    const c = ws.getCell(legendRow, i + 1);
    c.value = l.label;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: xlsxStatusFill(l.s) } };
    c.font = { bold: true };
    c.alignment = { horizontal: "center" };
    c.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = createExcelBlob(buffer);
  const fname = `Daily_Availability_${safeFilePart(station?.code)}_${entryDate}.xlsx`;
  return { blob, filename: fname };
}

/* ============================ UNIFIED MDR EDITOR ============================ */

function UnifiedMdrEditor({ onBack }: { onBack: () => void }) {
  const { locale, dir } = useI18n();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [reportDate, setReportDate] = useState(todayISO());
  const [values, setValues] = useState<Record<string, ValueDraft>>({});
  const [download, setDownload] = useState<DownloadLink | null>(null);
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;

  const { data, isLoading } = useQuery({
    queryKey: ["unified-mdr", reportDate],
    queryFn: async () => {
      const { data: stations, error: stationError } = await supabase
        .from("stations")
        .select("id, code, name_en, name_ar")
        .eq("active", true);
      if (stationError) throw stationError;
      const stationList = (stations ?? []) as Station[];
      const stationIds = stationList.map((station) => station.id);
      if (stationIds.length === 0) return { stations: stationList, equipment: [] as Equipment[], entries: [] as Entry[], values: [] as ValueRow[] };

      const [equipmentResult, entryResult] = await Promise.all([
        supabase
          .from("station_equipment")
          .select("*")
          .in("station_id", stationIds)
          .eq("active", true)
          .order("sort_order")
          .order("code"),
        supabase
          .from("equipment_availability_entries")
          .select("*")
          .in("station_id", stationIds)
          .eq("entry_date", reportDate),
      ]);
      if (equipmentResult.error) throw equipmentResult.error;
      if (entryResult.error) throw entryResult.error;
      const entries = (entryResult.data ?? []) as unknown as Entry[];
      const entryIds = entries.map((entry) => entry.id);
      let savedValues: ValueRow[] = [];
      if (entryIds.length > 0) {
        const valueResult = await supabase
          .from("equipment_availability_values")
          .select("*")
          .in("entry_id", entryIds);
        if (valueResult.error) throw valueResult.error;
        savedValues = (valueResult.data ?? []) as unknown as ValueRow[];
      }
      return {
        stations: stationList,
        equipment: (equipmentResult.data ?? []) as unknown as Equipment[],
        entries,
        values: savedValues,
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    const next: Record<string, ValueDraft> = {};
    for (const equipment of data.equipment) next[equipment.id] = emptyDraft();
    for (const value of data.values) {
      next[value.equipment_id] = {
        status: value.status,
        problem_description: value.problem_description ?? value.remark ?? "",
        work_notification: value.work_notification ?? "",
        work_center: value.work_center ?? "",
        notification_date: value.notification_date ?? "",
        ets: value.ets ?? "",
      };
    }
    setValues(next);
  }, [data]);

  useEffect(() => () => {
    if (download) URL.revokeObjectURL(download.url);
  }, [download]);

  const stationByCode = useMemo(() => {
    const result: Record<string, Station> = {};
    for (const station of data?.stations ?? []) result[station.code] = station;
    return result;
  }, [data?.stations]);

  const equipmentByStation = useMemo(() => {
    const result: Record<string, Equipment[]> = {};
    for (const equipment of data?.equipment ?? []) (result[equipment.station_id] ||= []).push(equipment);
    return result;
  }, [data?.equipment]);

  function updateValue(equipmentId: string, field: keyof ValueDraft, value: string) {
    setValues((current) => ({
      ...current,
      [equipmentId]: { ...(current[equipmentId] ?? emptyDraft()), [field]: value },
    }));
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!data || data.stations.length === 0) throw new Error(locale === "ar" ? "لا توجد محطات" : "No stations found");
      const stationIds = Array.from(new Set(data.equipment.map((equipment) => equipment.station_id)));
      const existingByStation = Object.fromEntries(data.entries.map((entry) => [entry.station_id, entry.id]));
      const entryIdByStation: Record<string, string> = { ...existingByStation };

      for (const stationId of stationIds) {
        if (entryIdByStation[stationId]) continue;
        const { data: entry, error } = await supabase
          .from("equipment_availability_entries")
          .insert({
            station_id: stationId,
            entry_date: reportDate,
            operator_id: profile?.id ?? null,
            operator_name: profile?.full_name ?? null,
            report_status: "draft",
          })
          .select("id")
          .single();
        if (error) throw error;
        entryIdByStation[stationId] = entry.id as string;
      }

      const rows = data.equipment.map((equipment) => {
        const value = values[equipment.id] ?? emptyDraft();
        return {
          entry_id: entryIdByStation[equipment.station_id],
          equipment_id: equipment.id,
          status: value.status,
          remark: value.problem_description || null,
          problem_description: value.problem_description || null,
          work_notification: value.work_notification || null,
          work_center: value.work_center || null,
          notification_date: value.notification_date || null,
          ets: value.ets || null,
        };
      });
      const { error } = await supabase
        .from("equipment_availability_values")
        .upsert(rows, { onConflict: "entry_id,equipment_id" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["unified-mdr", reportDate] });
      toast.success(locale === "ar" ? "تم حفظ تقرير MDR الموحّد" : "Unified MDR saved");
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  return (
    <div className="space-y-5" dir={dir}>
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <button onClick={onBack} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-accent">
          <Back className="h-4 w-4" /> {locale === "ar" ? "رجوع" : "Back"}
        </button>
        <div className="min-w-[190px] flex-1">
          <h1 className="text-xl font-bold">{locale === "ar" ? "تقرير MDR اليومي الموحّد" : "Unified Daily MDR"}</h1>
          <p className="text-xs text-muted-foreground">{locale === "ar" ? "جميع الخطوط والمحطات في تقرير واحد" : "All lines and stations in one report"}</p>
        </div>
        <input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} className="h-9 rounded-lg border bg-background px-3 text-sm" dir="ltr" />
        <button disabled={save.isPending || isLoading} onClick={() => save.mutate()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          <Save className="h-4 w-4" /> {save.isPending ? (locale === "ar" ? "جارٍ الحفظ…" : "Saving…") : (locale === "ar" ? "حفظ الكل" : "Save all")}
        </button>
        <button
          disabled={isLoading}
          onClick={async () => {
            try {
              if (save.isPending) return;
              await save.mutateAsync();
              const file = await exportCombinedAvailabilityXlsx({ locale, date: reportDate });
              const link = await triggerBlobDownload(file.blob, file.filename);
              setDownload((previous) => { if (previous) URL.revokeObjectURL(previous.url); return link; });
              toast.success(locale === "ar" ? "تم تصدير ملف MDR الموحّد" : "Unified MDR exported");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : String(error));
            }
          }}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary px-4 text-sm font-medium text-primary disabled:opacity-50"
        >
          <FileSpreadsheet className="h-4 w-4" /> {locale === "ar" ? "حفظ وتصدير Excel" : "Save & export Excel"}
        </button>
      </div>

      {download && <a href={download.url} download={download.filename} rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-primary underline"><FileSpreadsheet className="h-4 w-4" />{locale === "ar" ? "تحميل الملف مرة أخرى" : "Download file again"}</a>}
      {isLoading ? <div className="py-12 text-center text-muted-foreground">{locale === "ar" ? "جارٍ تحميل جميع المحطات…" : "Loading all stations…"}</div> : (
        <div className="space-y-8" dir="ltr">
          {MDR_LAYOUT.map((line) => (
            <section key={line.label} className="space-y-3">
              <h2 className="bg-primary px-4 py-2 text-center text-lg font-bold text-primary-foreground">{line.label}</h2>
              {line.blocks.map((block) => {
                const station = stationByCode[block.station];
                if (!station) return null;
                const units = (equipmentByStation[station.id] ?? []).filter((equipment) => matchesSuffix(equipment.code, block.suffix));
                if (units.length === 0) return null;
                return (
                  <div key={`${block.station}-${block.title}`} className="overflow-x-auto border">
                    <div className="flex items-center bg-sky-100 px-3 py-2 text-foreground">
                      <span className="w-28 font-bold">STATION</span><strong className="text-base">{block.title}</strong>
                    </div>
                    <table className="w-full min-w-[1050px] table-fixed text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="w-28 border p-2">Pump No.</th><th className="w-64 border p-2">Problem Description</th><th className="w-48 border p-2">Unit Status</th><th className="w-44 border p-2">W. Notification</th><th className="w-32 border p-2">Work Center</th><th className="w-36 border p-2">Date</th><th className="w-32 border p-2">ETS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {units.map((equipment) => {
                          const value = values[equipment.id] ?? emptyDraft();
                          return (
                            <tr key={equipment.id}>
                              <td className="border p-2 text-center font-bold">{equipment.code}</td>
                              <td className="border p-1"><textarea value={value.problem_description} onChange={(event) => updateValue(equipment.id, "problem_description", event.target.value)} className="min-h-10 w-full resize-y bg-transparent p-1" /></td>
                              <td className="border p-1"><select value={value.status} onChange={(event) => updateValue(equipment.id, "status", event.target.value)} className={`h-10 w-full border px-2 font-bold ${statusColor(value.status)}`}>{STATUS_LIST.map((status) => <option key={status} value={status}>{statusLabel(status, locale)}</option>)}</select></td>
                              <td className="border p-1"><input value={value.work_notification} onChange={(event) => updateValue(equipment.id, "work_notification", event.target.value)} className="h-10 w-full bg-transparent px-2" /></td>
                              <td className="border p-1"><input value={value.work_center} onChange={(event) => updateValue(equipment.id, "work_center", event.target.value)} className="h-10 w-full bg-transparent px-2" /></td>
                              <td className="border p-1"><input type="date" value={value.notification_date} onChange={(event) => updateValue(equipment.id, "notification_date", event.target.value)} className="h-10 w-full bg-transparent px-1" /></td>
                              <td className="border p-1"><input value={value.ets} onChange={(event) => updateValue(equipment.id, "ets", event.target.value)} className="h-10 w-full bg-transparent px-2" /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ COMBINED XLSX EXPORT ============================ */

// Exact layout of the ministerial workbook "DAILY REPORT OF PUMPING STATIONS STATUS - ALL LINES".
// Each LINE band holds ordered station blocks; a block may be a filtered subset of a station's units.
type MdrBlock = { title: string; station: string; suffix?: "A" | "B" | "F" | "G" };
type MdrLine = { label: string; blocks: MdrBlock[] };

const MDR_LAYOUT: MdrLine[] = [
  {
    label: "LINE ( A + B )",
    blocks: [
      { title: "PS1-A", station: "PS1_AB", suffix: "A" },
      { title: "PS1-B", station: "PS1_AB", suffix: "B" },
      { title: "PS2-A", station: "PS2_AB", suffix: "A" },
      { title: "PS2-B", station: "PS2_AB", suffix: "B" },
      { title: "PS3-A", station: "PS3_AB", suffix: "A" },
      { title: "PS3-B", station: "PS3_AB", suffix: "B" },
      { title: "PS4-A", station: "PS4_AB", suffix: "A" },
      { title: "PS4-B", station: "PS4_AB", suffix: "B" },
      { title: "PS5-A", station: "PS5_AB", suffix: "A" },
      { title: "PS5-B", station: "PS5_AB", suffix: "B" },
      { title: "PS6-A", station: "PS6_AB", suffix: "A" },
      { title: "PS6-B", station: "PS6_AB", suffix: "B" },
    ],
  },
  {
    label: "LINE ( C )",
    blocks: [
      { title: "PS-1 C", station: "PS1_C" },
      { title: "PS2-C", station: "PS2_C" },
      { title: "PS3-C", station: "PS3_C" },
      { title: "PS4-C", station: "PS4_C" },
    ],
  },
  {
    label: "LINE ( F + G )",
    blocks: [
      { title: "PS1-F", station: "PS1_FG", suffix: "F" },
      { title: "PS2-F", station: "PS2_FG", suffix: "F" },
      { title: "PS3-F", station: "PS3_FG", suffix: "F" },
      { title: "PS1-G", station: "PS1_FG", suffix: "G" },
      { title: "PS2-G", station: "PS2_FG", suffix: "G" },
      { title: "PS3-G", station: "PS3_FG", suffix: "G" },
    ],
  },
  {
    label: "RQWTS",
    blocks: [
      { title: "PS1 - Al Hissi - Line A", station: "PS1_ALHISSI", suffix: "A" },
      { title: "PS1 - Al Hissi - Line B", station: "PS1_ALHISSI", suffix: "B" },
      { title: "PS2 - Al-Majmah Line A", station: "PS2_MAJMAAH", suffix: "A" },
      { title: "PS2 - Al-Majmah Line B", station: "PS2_MAJMAAH", suffix: "B" },
      { title: "PS2 - SLT", station: "SLT" },
      { title: "BUT Lifting Pumps", station: "BURAIYDAH" },
    ],
  },
];

function matchesSuffix(code: string, suffix?: "A" | "B" | "F" | "G") {
  if (!suffix) return true;
  return code.trim().toUpperCase().endsWith(suffix);
}

async function exportCombinedAvailabilityXlsx(opts: { locale: "ar" | "en"; date: string }) {
  const { locale, date } = opts;

  const { data: stations, error: sErr } = await supabase
    .from("stations")
    .select("id, code, name_en, name_ar")
    .eq("active", true);
  if (sErr) throw sErr;
  const stationList = (stations ?? []) as Station[];
  const byCode: Record<string, Station> = {};
  for (const s of stationList) byCode[s.code] = s;

  const stationIds = stationList.map((s) => s.id);
  const { data: eqRows, error: eErr } = await supabase
    .from("station_equipment")
    .select("*")
    .in("station_id", stationIds)
    .eq("active", true)
    .order("sort_order")
    .order("code");
  if (eErr) throw eErr;
  const equipmentByStation: Record<string, Equipment[]> = {};
  for (const e of (eqRows ?? []) as unknown as Equipment[]) {
    (equipmentByStation[e.station_id] ||= []).push(e);
  }

  // Use only the selected report date so older station data is never mixed into a new MDR.
  const { data: entries, error: enErr } = await supabase
    .from("equipment_availability_entries")
    .select("*")
    .in("station_id", stationIds)
    .eq("entry_date", date);
  if (enErr) throw enErr;
  const latestEntryByStation: Record<string, Entry> = {};
  for (const e of (entries ?? []) as unknown as Entry[]) {
    if (!latestEntryByStation[e.station_id]) latestEntryByStation[e.station_id] = e;
  }
  const entryIds = Object.values(latestEntryByStation).map((e) => e.id);
  const valuesByEquipment: Record<string, ValueRow> = {};
  if (entryIds.length) {
    const { data: vals, error: vErr } = await supabase
      .from("equipment_availability_values")
      .select("*")
      .in("entry_id", entryIds);
    if (vErr) throw vErr;
    for (const v of (vals ?? []) as unknown as ValueRow[]) {
      valuesByEquipment[v.equipment_id] = v;
    }
  }

  const ExcelJS = (await import("exceljs")) as any;
  const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook;
  if (!Workbook) throw new Error("Excel engine not loaded");
  const wb = new Workbook();
  wb.creator = "WTCO";
  wb.created = new Date();
  const ws = wb.addWorksheet("ALL LINES", {
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });

  // Column widths mirror the source workbook (A spacer, B..M report body)
  ws.columns = [
    { width: 3 },   // A
    { width: 3 },   // B
    { width: 9 },   // C  Pump No. (C:D)
    { width: 14 },  // D
    { width: 35 },  // E  Problem Description (E:G)
    { width: 2 },   // F
    { width: 36 },  // G
    { width: 14 },  // H  Unit Status (H:I)
    { width: 26 },  // I
    { width: 29 },  // J  W. Notification
    { width: 19 },  // K  Work Center
    { width: 17 },  // L  Date
    { width: 15 },  // M  ETS
  ];

  const thin = { style: "thin" as const, color: { argb: "FF808080" } };
  const allBorders = { top: thin, bottom: thin, left: thin, right: thin };

  // Titles
  ws.mergeCells("B2:M2");
  const t1 = ws.getCell("B2");
  t1.value = "JUBAIL WATER TRANSMISSION SYSTEM";
  t1.font = { bold: true, size: 20 };
  t1.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 28;

  ws.mergeCells("B4:M4");
  const t2 = ws.getCell("B4");
  t2.value = "DAILY REPORT OF PUMPING STATIONS STATUS - ALL LINES";
  t2.font = { bold: true, size: 20 };
  t2.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(4).height = 28;

  const dLabel = ws.getCell("C7");
  dLabel.value = "DATE";
  dLabel.font = { bold: true, size: 14 };
  dLabel.alignment = { horizontal: "center", vertical: "middle" };
  dLabel.border = allBorders;
  ws.mergeCells("D7:E8");
  const dVal = ws.getCell("D7");
  dVal.value = date;
  dVal.font = { bold: true, size: 14 };
  dVal.alignment = { horizontal: "center", vertical: "middle" };
  dVal.border = allBorders;

  const headers: [string, string][] = [
    ["C", "Pump No."],
    ["E", "Problem Description"],
    ["H", "Unit Status"],
    ["J", "W. Notification "],
    ["K", "Work Center"],
    ["L", "Date"],
    ["M", "ETS"],
  ];

  let r = 10;

  for (const line of MDR_LAYOUT) {
    // Line band
    ws.mergeCells(`C${r}:M${r}`);
    const band = ws.getCell(`C${r}`);
    band.value = line.label;
    band.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    band.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    band.alignment = { horizontal: "center", vertical: "middle" };
    band.border = allBorders;
    ws.getRow(r).height = 22;
    r += 2;

    for (const block of line.blocks) {
      const station = byCode[block.station];
      if (!station) continue;
      const units = (equipmentByStation[station.id] ?? []).filter((e) => matchesSuffix(e.code, block.suffix));
      if (units.length === 0) continue;

      // STATION row
      ws.mergeCells(`C${r}:D${r}`);
      const stLabel = ws.getCell(`C${r}`);
      stLabel.value = "STATION";
      stLabel.font = { bold: true, size: 16 };
      stLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00B0F0" } };
      stLabel.alignment = { horizontal: "center", vertical: "middle" };
      stLabel.border = allBorders;
      ws.mergeCells(`E${r}:G${r}`);
      const stName = ws.getCell(`E${r}`);
      stName.value = block.title;
      stName.font = { bold: true, size: 16 };
      stName.alignment = { horizontal: "center", vertical: "middle" };
      stName.border = allBorders;
      ws.getRow(r).height = 22;
      r++;

      // Header row
      ws.mergeCells(`C${r}:D${r}`);
      ws.mergeCells(`E${r}:G${r}`);
      ws.mergeCells(`H${r}:I${r}`);
      for (const [col, label] of headers) {
        const c = ws.getCell(`${col}${r}`);
        c.value = label;
        c.font = { bold: true, size: 11 };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6DCE4" } };
        c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        c.border = allBorders;
      }
      ws.getRow(r).height = 20;
      r++;

      // Unit rows
      for (const e of units) {
        const v = valuesByEquipment[e.id];
        const status = (v?.status ?? "in_service") as EqStatus;
        ws.mergeCells(`C${r}:D${r}`);
        ws.mergeCells(`E${r}:G${r}`);
        ws.mergeCells(`H${r}:I${r}`);

        const cells: [string, string][] = [
          ["C", e.code],
          ["E", v?.problem_description ?? v?.remark ?? ""],
          ["H", xlsxStatusLabel(status)],
          ["J", v?.work_notification ?? ""],
          ["K", v?.work_center ?? ""],
          ["L", v?.notification_date ?? ""],
          ["M", v?.ets ?? ""],
        ];
        for (const [col, val] of cells) {
          const c = ws.getCell(`${col}${r}`);
          c.value = val;
          c.font = { bold: true, size: 11 };
          c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          c.border = allBorders;
        }
        const statusCell = ws.getCell(`H${r}`);
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: xlsxStatusFill(status) } };
        ws.getRow(r).height = 18;
        r++;
      }

      r++; // spacer between station blocks
    }

    r++; // extra spacer between lines
  }

  // Legend
  r++;
  const legends: { label: string; s: EqStatus }[] = [
    { label: "IN SERVICE", s: "in_service" },
    { label: "ON STANDBY", s: "standby" },
    { label: "OUT OF SERVICE", s: "out_of_service" },
    { label: "EMERGENCY STANDBY", s: "emergency_standby" },
    { label: "STANDBY ON FIXED SPEED", s: "standby_fixed_speed" },
    { label: "IN SERVICE ON FIXED SPEED", s: "in_service_fixed_speed" },
    { label: "RUNNING ON EMERGENCY", s: "running_on_emergency" },
  ];
  legends.forEach((l, i) => {
    const c = ws.getCell(r, i + 3);
    c.value = l.label;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: xlsxStatusFill(l.s) } };
    c.font = { bold: true };
    c.alignment = { horizontal: "center", wrapText: true };
    c.border = allBorders;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = createExcelBlob(buffer);
  const fname = `DAILY_REPORT_ALL_LINES_${date}.xlsx`;
  return { blob, filename: fname };
}

