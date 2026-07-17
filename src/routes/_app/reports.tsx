import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Printer,
  Plus,
  FileText,
  Mail,
  Trash2,
  Sun,
  Moon,
  FileSpreadsheet,
} from "lucide-react";
import { z } from "zod";
import { buildElementPdf, createExcelBlob, safeFilePart, triggerBlobDownload, type DownloadLink } from "@/lib/export-utils";

const searchSchema = z.object({
  id: z.string().optional(),
});

export const Route = createFileRoute("/_app/reports")({
  validateSearch: searchSchema,
  component: ReportsPage,
});

interface Station {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
}

interface ShiftReport {
  id: string;
  station_id: string;
  report_date: string;
  shift: "day" | "night";
  lines: unknown;
  remarks: string[];
  reported_by: string | null;
  operator_id: string | null;
  created_at: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function shiftLabel(s: "day" | "night", locale: "ar" | "en") {
  if (s === "day") return locale === "ar" ? "نهاري (6ص - 6م)" : "Day (6am - 6pm)";
  return locale === "ar" ? "ليلي (6م - 6ص)" : "Night (6pm - 6am)";
}

function ReportsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/reports" });
  if (search.id) {
    return (
      <EditorView
        id={search.id}
        onBack={() => navigate({ search: {}, replace: false })}
      />
    );
  }
  return (
    <ListView
      onNew={() => navigate({ search: { id: "new" }, replace: false })}
      onOpen={(id) => navigate({ search: { id }, replace: false })}
    />
  );
}

/* ============================ LIST ============================ */

function ListView({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const { locale, t } = useI18n();
  const { profile, isAdmin, hasRole } = useAuth();
  const qc = useQueryClient();
  const canFilterStation = isAdmin || hasRole("supervisor") || hasRole("viewer");
  const [stationFilter, setStationFilter] = useState<string>(profile?.station_id ?? "");

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

  const { data: reports, isLoading } = useQuery({
    queryKey: ["shift-reports", stationFilter || "all"],
    queryFn: async () => {
      let q = supabase
        .from("shift_reports")
        .select("*")
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (stationFilter) q = q.eq("station_id", stationFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ShiftReport[];
    },
  });

  const stationMap = useMemo(() => {
    const m: Record<string, Station> = {};
    for (const s of stations ?? []) m[s.id] = s;
    return m;
  }, [stations]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shift_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(locale === "ar" ? "تم الحذف" : "Deleted");
      qc.invalidateQueries({ queryKey: ["shift-reports"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            {locale === "ar" ? "تقارير الشفت اليومية" : "Daily Shift Reports"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? "إنشاء وطباعة تقارير المشغل لكل شفت"
              : "Create and print operator shift reports"}
          </p>
        </div>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {locale === "ar" ? "تقرير جديد" : "New Report"}
        </button>
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
      ) : (reports ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {locale === "ar" ? "لا توجد تقارير بعد" : "No reports yet"}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-start px-3 py-2 font-medium">{t("common.date")}</th>
                <th className="text-start px-3 py-2 font-medium">
                  {locale === "ar" ? "الشفت" : "Shift"}
                </th>
                <th className="text-start px-3 py-2 font-medium">{t("common.station")}</th>
                <th className="text-start px-3 py-2 font-medium">
                  {locale === "ar" ? "بواسطة" : "By"}
                </th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {(reports ?? []).map((r) => {
                const s = stationMap[r.station_id];
                return (
                  <tr
                    key={r.id}
                    className="border-t hover:bg-muted/20 cursor-pointer"
                    onClick={() => onOpen(r.id)}
                  >
                    <td className="px-3 py-2" dir="ltr">
                      {r.report_date}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                          r.shift === "day"
                            ? "bg-warning/15 text-warning-foreground"
                            : "bg-primary/15 text-primary"
                        }`}
                      >
                        {r.shift === "day" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                        {shiftLabel(r.shift, locale)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {s ? `${s.code} · ${locale === "ar" ? s.name_ar : s.name_en}` : "—"}
                    </td>
                    <td className="px-3 py-2">{r.reported_by ?? "—"}</td>
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

interface FormState {
  report_date: string;
  shift: "day" | "night";
  body: string;
  reported_by: string;
}

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
    queryKey: ["shift-report", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_reports")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as ShiftReport;
    },
  });

  const [stationId, setStationId] = useState<string>(profile?.station_id ?? "");
  const [form, setForm] = useState<FormState>(() => ({
    report_date: todayISO(),
    shift: "day",
    body: "",
    reported_by: "",
  }));
  const [excelDownload, setExcelDownload] = useState<DownloadLink | null>(null);
  const [pdfDownload, setPdfDownload] = useState<DownloadLink | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const stationMap = useMemo(() => {
    const m: Record<string, Station> = {};
    for (const s of stations ?? []) m[s.id] = s;
    return m;
  }, [stations]);

  useEffect(() => {
    if (isNew) {
      setStationId(profile?.station_id ?? "");
      setForm((f) => ({
        ...f,
        reported_by: f.reported_by || profile?.full_name || "",
      }));
      setHydrated(true);
      return;
    }
    if (!existing) return;
    setStationId(existing.station_id);
    setForm({
      report_date: existing.report_date,
      shift: existing.shift,
      body: (existing.remarks ?? []).join("\n"),
      reported_by: existing.reported_by ?? "",
    });
    setHydrated(true);
  }, [isNew, existing, profile?.station_id, profile?.full_name]);

  useEffect(() => {
    return () => {
      if (excelDownload) URL.revokeObjectURL(excelDownload.url);
      if (pdfDownload) URL.revokeObjectURL(pdfDownload.url);
    };
  }, [excelDownload, pdfDownload]);

  const save = useMutation({
    mutationFn: async () => {
      if (!stationId) throw new Error(locale === "ar" ? "اختر المحطة" : "Pick a station");
      const payload = {
        station_id: stationId,
        report_date: form.report_date,
        shift: form.shift,
        lines: [],
        remarks: form.body.trim() ? [form.body] : [],
        reported_by: form.reported_by || null,
      };
      if (isNew) {
        const { data, error } = await supabase
          .from("shift_reports")
          .insert({ ...payload, operator_id: profile?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }
      const { error } = await supabase.from("shift_reports").update(payload).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (newId) => {
      toast.success(locale === "ar" ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["shift-reports"] });
      qc.invalidateQueries({ queryKey: ["shift-report", newId] });
      if (isNew) window.history.replaceState({}, "", `?id=${newId}`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const station = stationMap[stationId];

  const emailReport = () => {
    const subject = `Shift Report - ${form.report_date} - ${shiftLabel(form.shift, "en")}${
      station ? " - " + station.code : ""
    }`;
    const s = station ? `${station.code} - ${locale === "ar" ? station.name_ar : station.name_en}` : "";
    const body = [
      `${s} Shift Report`,
      ``,
      `Date: ${form.report_date}`,
      `Shift: ${shiftLabel(form.shift, "en")}`,
      ``,
      form.body || "—",
      ``,
      `Reported by: ${form.reported_by}`,
    ].join("\n");
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

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

  const stationTitle =
    station && `${station.code} · ${locale === "ar" ? station.name_ar : station.name_en}`;

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
                elementId: "shift-report-print-sheet",
                filename: `Shift_Report_${safeFilePart(station?.code)}_${form.report_date}.pdf`,
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
              const file = await exportShiftReportXlsx({ station: station ?? null, form });
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
          onClick={emailReport}
          className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent"
        >
          <Mail className="h-4 w-4" />
          {locale === "ar" ? "إرسال بالإيميل" : "Email"}
        </button>
        <button
          onClick={() => save.mutate()}
          disabled={!canWrite || save.isPending}
          className="inline-flex items-center gap-2 text-sm px-4 h-9 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90"
        >
          <Save className="h-4 w-4" />
          {save.isPending ? (locale === "ar" ? "جارٍ الحفظ…" : "Saving…") : t("common.save")}
        </button>
      </div>

      {/* Meta inputs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("common.station")}</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            disabled={!canWrite}
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
            value={form.report_date}
            onChange={(e) => setForm((f) => ({ ...f, report_date: e.target.value }))}
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
            value={form.shift}
            onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value as "day" | "night" }))}
            disabled={!canWrite}
            className="h-10 px-3 rounded-lg border bg-background text-sm"
          >
            <option value="day">{shiftLabel("day", locale)}</option>
            <option value="night">{shiftLabel("night", locale)}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {locale === "ar" ? "بواسطة" : "Reported by"}
          </label>
          <input
            value={form.reported_by}
            onChange={(e) => setForm((f) => ({ ...f, reported_by: e.target.value }))}
            disabled={!canWrite}
            className="h-10 px-3 rounded-lg border bg-background text-sm"
          />
        </div>
      </div>

      {/* Printable sheet */}
      <div
        id="shift-report-print-sheet"
        className="rounded-xl border bg-card p-6 md:p-8 print:border-0 print:shadow-none print:rounded-none print:p-0"
        dir="ltr"
      >
        <div className="text-center mb-6 print:mb-4">
          <h2 className="text-lg font-bold uppercase tracking-wide">
            {stationTitle ? `${stationTitle} — ` : ""}Shift Report
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm max-w-md mx-auto">
            <div className="text-end font-semibold">Date:</div>
            <div className="text-start">{form.report_date || "—"}</div>
            <div className="text-end font-semibold">Shift:</div>
            <div className="text-start">{shiftLabel(form.shift, "en")}</div>
          </div>
        </div>

        <textarea
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          disabled={!canWrite}
          placeholder={
            locale === "ar" ? "اكتب تقرير الشفت هنا…" : "Write your shift report here…"
          }
          rows={18}
          className="w-full min-h-[420px] p-3 rounded-lg border bg-background text-sm leading-relaxed focus:outline-none focus:border-primary whitespace-pre-wrap print:border-0 print:p-0 print:text-[13px]"
          dir="auto"
        />

        <div className="mt-8 pt-4 border-t flex justify-between text-sm">
          <div>
            <span className="font-semibold">Reported by:</span>{" "}
            <span>{form.reported_by || "—"}</span>
          </div>
          <div className="text-muted-foreground print:text-black">
            {new Date().toLocaleDateString("en-GB")}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white !important; }
          aside, header, nav, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          #shift-report-print-sheet { color: black !important; }
          #shift-report-print-sheet textarea, #shift-report-print-sheet input, #shift-report-print-sheet select {
            border: none !important; background: transparent !important; color: black !important;
            padding: 0 !important; height: auto !important; resize: none !important;
            -webkit-appearance: none; appearance: none;
          }
        }
      `}</style>
    </div>
  );
}

async function exportShiftReportXlsx(opts: { station: Station | null; form: FormState }) {
  const { station, form } = opts;
  const ExcelJS = (await import("exceljs")) as any;
  const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook;
  if (!Workbook) throw new Error("Excel engine not loaded");
  const wb = new Workbook();
  wb.creator = "WTCO";
  wb.created = new Date();
  const ws = wb.addWorksheet(station?.code || "Shift Report", {
    pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [{ width: 18 }, { width: 70 }];
  ws.mergeCells("A1:B1");
  ws.getCell("A1").value = "SHIFT REPORT";
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF1F4E78" } };
  ws.getCell("A1").alignment = { horizontal: "center" };
  const rows = [
    ["Station", station ? `${station.code} - ${station.name_en}` : ""],
    ["Date", form.report_date],
    ["Shift", shiftLabel(form.shift, "en")],
    ["Reported by", form.reported_by],
    ["Report", form.body || "—"],
  ];
  rows.forEach((row, index) => {
    const r = ws.getRow(index + 3);
    r.values = row;
    r.getCell(1).font = { bold: true, color: { argb: "FF1F4E78" } };
    r.eachCell({ includeEmpty: true }, (cell: any) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFBFBFBF" } },
        bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
        left: { style: "thin", color: { argb: "FFBFBFBF" } },
        right: { style: "thin", color: { argb: "FFBFBFBF" } },
      };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });
  ws.getRow(7).height = 180;
  const buffer = await wb.xlsx.writeBuffer();
  const blob = createExcelBlob(buffer);
  return {
    blob,
    filename: `Shift_Report_${safeFilePart(station?.code)}_${form.report_date}.xlsx`,
  };
}
