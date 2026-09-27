import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  Printer,
  Plus,
  AlertTriangle,
  Mail,
  Trash2,
  Paperclip,
  Upload,
  X,
  Image as ImageIcon,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { z } from "zod";
import { buildElementPdf, createExcelBlob, safeFilePart, triggerBlobDownload, type DownloadLink } from "@/lib/export-utils";

const searchSchema = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/_app/incidents")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Incident Reports | WTCO Operations" },
      { name: "description", content: "Create, review, and export WTCO operations incident reports with supporting photos." },
      { property: "og:title", content: "Incident Reports | WTCO Operations" },
      { property: "og:description", content: "Create, review, and export WTCO operations incident reports with supporting photos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IncidentsPage,
});

interface Station {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
}

interface IncidentRow {
  id: string;
  station_id: string;
  title: string;
  equipment: string;
  incident_no: string | null;
  occurred_at: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "closed";
  reporter_name: string | null;
  report_data: ReportData | null;
  created_at: string;
}

interface TimelineItem { time: string; event: string; }
interface LabeledItem { label: string; text: string; }

interface ReportData {
  subject: string;
  incident_no: string;
  incident_date: string; // YYYY-MM-DD
  incident_time: string; // HH:MM
  location: string;
  executive_summary: string;
  timeline: TimelineItem[];
  causes: LabeledItem[];
  impact: LabeledItem[];
  prepared_name: string;
  prepared_role: string;
  prepared_date: string;
}

interface Attachment {
  id: string;
  incident_id: string;
  storage_path: string;
  file_name: string;
  content_type: string | null;
  created_at: string;
}

const BUCKET = "incident-attachments";

function todayISO() { return new Date().toISOString().slice(0, 10); }

function emptyReport(): ReportData {
  return {
    subject: "",
    incident_no: "",
    incident_date: todayISO(),
    incident_time: "",
    location: "",
    executive_summary: "",
    timeline: [{ time: "", event: "" }],
    causes: [{ label: "", text: "" }],
    impact: [{ label: "", text: "" }],
    prepared_name: "",
    prepared_role: "",
    prepared_date: todayISO(),
  };
}

function IncidentsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/incidents" });
  if (search.id) {
    return <EditorView id={search.id} onBack={() => navigate({ search: {}, replace: false })} />;
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
  const { scopedStationId, canPickStation } = useStationScope();
  const canFilter = (isAdmin || hasRole("supervisor") || hasRole("viewer")) && canPickStation;
  const [stationFilter, setStationFilter] = useState<string>(scopedStationId ?? profile?.station_id ?? "");

  const { data: stations } = useScopedStations();

  const { data: incidents, isLoading } = useQuery({
    queryKey: ["incidents", stationFilter || "all"],
    queryFn: async () => {
      let q = supabase.from("incidents").select("*").order("occurred_at", { ascending: false }).limit(100);
      if (stationFilter) q = q.eq("station_id", stationFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as IncidentRow[];
    },
  });

  const stationMap = useMemo(() => {
    const m: Record<string, Station> = {};
    for (const s of stations ?? []) m[s.id] = s;
    return m;
  }, [stations]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("incidents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(locale === "ar" ? "تم الحذف" : "Deleted");
      qc.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-primary" />
            {locale === "ar" ? "تقارير الحوادث" : "Incident Reports"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? "توثيق حوادث التشغيل بصيغة موحدة"
              : "Document operations incidents with a standard format"}
          </p>
        </div>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {locale === "ar" ? "تقرير حادث جديد" : "New Incident Report"}
        </button>
      </div>

      {canFilter && (
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
      ) : (incidents ?? []).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {locale === "ar" ? "لا توجد حوادث مسجلة" : "No incidents yet"}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-start px-3 py-2 font-medium">
                  {locale === "ar" ? "التاريخ" : "Date"}
                </th>
                <th className="text-start px-3 py-2 font-medium">
                  {locale === "ar" ? "الرقم" : "No."}
                </th>
                <th className="text-start px-3 py-2 font-medium">
                  {locale === "ar" ? "الموضوع" : "Subject"}
                </th>
                <th className="text-start px-3 py-2 font-medium">{t("common.station")}</th>
                <th className="text-start px-3 py-2 font-medium">
                  {locale === "ar" ? "بواسطة" : "By"}
                </th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {(incidents ?? []).map((r) => {
                const s = stationMap[r.station_id];
                return (
                  <tr
                    key={r.id}
                    className="border-t hover:bg-muted/20 cursor-pointer"
                    onClick={() => onOpen(r.id)}
                  >
                    <td className="px-3 py-2" dir="ltr">
                      {r.occurred_at.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2" dir="ltr">{r.incident_no || "—"}</td>
                    <td className="px-3 py-2">{r.title || "—"}</td>
                    <td className="px-3 py-2">
                      {s ? `${s.code} · ${locale === "ar" ? s.name_ar : s.name_en}` : "—"}
                    </td>
                    <td className="px-3 py-2">{r.reporter_name ?? "—"}</td>
                    <td className="px-3 py-2 text-end">
                      {(isAdmin || hasRole("supervisor")) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(locale === "ar" ? "حذف الحادث؟" : "Delete incident?"))
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

  const { data: stations } = useScopedStations();

  const { data: existing, isLoading } = useQuery({
    queryKey: ["incident", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase.from("incidents").select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as IncidentRow;
    },
  });

  const [stationId, setStationId] = useState<string>(profile?.station_id ?? "");
  const [equipment, setEquipment] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [report, setReport] = useState<ReportData>(() => emptyReport());
  const [excelDownload, setExcelDownload] = useState<DownloadLink | null>(null);
  const [pdfDownload, setPdfDownload] = useState<DownloadLink | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);

  const stationMap = useMemo(() => {
    const m: Record<string, Station> = {};
    for (const s of stations ?? []) m[s.id] = s;
    return m;
  }, [stations]);

  useEffect(() => {
    if (isNew) {
      setStationId(profile?.station_id ?? "");
      setReporterName((prev) => prev || profile?.full_name || "");
      setReport((r) => ({
        ...r,
        prepared_name: r.prepared_name || profile?.full_name || "",
      }));
      setHydrated(true);
      return;
    }
    if (!existing) return;
    setStationId(existing.station_id);
    setEquipment(existing.equipment || "");
    setReporterName(existing.reporter_name ?? "");
    const merged = { ...emptyReport(), ...(existing.report_data ?? {}) };
    // ensure arrays exist
    if (!Array.isArray(merged.timeline) || merged.timeline.length === 0) merged.timeline = [{ time: "", event: "" }];
    if (!Array.isArray(merged.causes) || merged.causes.length === 0) merged.causes = [{ label: "", text: "" }];
    if (!Array.isArray(merged.impact) || merged.impact.length === 0) merged.impact = [{ label: "", text: "" }];
    if (!merged.subject) merged.subject = existing.title || "";
    if (!merged.incident_no) merged.incident_no = existing.incident_no || "";
    setReport(merged);
    setHydrated(true);
  }, [isNew, existing, profile?.station_id, profile?.full_name]);

  useEffect(() => {
    return () => {
      if (excelDownload) URL.revokeObjectURL(excelDownload.url);
      if (pdfDownload) URL.revokeObjectURL(pdfDownload.url);
    };
  }, [excelDownload, pdfDownload]);

  const pendingPhotoPreviews = useMemo(
    () => pendingPhotos.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [pendingPhotos],
  );

  useEffect(() => {
    return () => pendingPhotoPreviews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [pendingPhotoPreviews]);

  /* ---------- Attachments ---------- */
  const { data: attachments } = useQuery({
    queryKey: ["incident-attachments", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_attachments")
        .select("*")
        .eq("incident_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      const list = attachments ?? [];
      if (list.length === 0) return;
      const paths = list.map((a) => a.storage_path);
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r, i) => {
        if (r.signedUrl) map[paths[i]] = r.signedUrl;
      });
      setSignedUrls(map);
    })();
  }, [attachments]);

  const uploadAttachment = async (incidentId: string, file: File) => {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${incidentId}/${Date.now()}_${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (up.error) throw up.error;
      const { error } = await supabase.from("incident_attachments").insert({
        incident_id: incidentId,
        storage_path: path,
        file_name: file.name,
        content_type: file.type || null,
        uploaded_by: profile?.id ?? null,
      });
      if (error) throw error;
  };

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      if (isNew) {
        setPendingPhotos((current) => [...current, file]);
        return;
      }
      await uploadAttachment(id, file);
    },
    onSuccess: () => {
      if (!isNew) {
        toast.success(locale === "ar" ? "تم الرفع" : "Uploaded");
        qc.invalidateQueries({ queryKey: ["incident-attachments", id] });
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const removeAttachment = useMutation({
    mutationFn: async (att: Attachment) => {
      await supabase.storage.from(BUCKET).remove([att.storage_path]);
      const { error } = await supabase.from("incident_attachments").delete().eq("id", att.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(locale === "ar" ? "تم الحذف" : "Removed");
      qc.invalidateQueries({ queryKey: ["incident-attachments", id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  /* ---------- Save ---------- */
  const save = useMutation({
    mutationFn: async () => {
      if (!stationId) throw new Error(locale === "ar" ? "اختر المحطة" : "Pick a station");
      if (!report.subject.trim()) throw new Error(locale === "ar" ? "أدخل الموضوع" : "Enter subject");
      const occurredAt = new Date(
        `${report.incident_date}T${(report.incident_time || "00:00")}:00`
      ).toISOString();
      const payload = {
        station_id: stationId,
        title: report.subject.trim(),
        equipment: equipment || report.subject.trim(),
        description: report.executive_summary || report.subject.trim() || "-",
        incident_no: report.incident_no || null,
        occurred_at: occurredAt,
        reporter_name: reporterName || null,
        report_data: report as unknown as never,
      };
      if (isNew) {
        const { data, error } = await supabase
          .from("incidents")
          .insert({ ...payload, reported_by: profile?.id ?? null })
          .select("id").single();
        if (error) throw error;
        for (const photo of pendingPhotos) {
          await uploadAttachment(data.id, photo);
        }
        return data.id as string;
      }
      const { error } = await supabase.from("incidents").update(payload).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (newId) => {
      toast.success(locale === "ar" ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["incident", newId] });
      if (isNew) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("id", newId);
        window.location.replace(nextUrl.toString());
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const station = stationMap[stationId];
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const imageAttachments = (attachments ?? []).filter((attachment) =>
    (attachment.content_type ?? "").startsWith("image/"),
  );
  const fileAttachments = (attachments ?? []).filter((attachment) =>
    !(attachment.content_type ?? "").startsWith("image/"),
  );

  const emailReport = () => {
    const subject = `Incident Report - ${report.incident_date} - ${report.subject}`;
    const lines: string[] = [];
    lines.push(`Operations Incident Report`);
    lines.push(``);
    lines.push(`Date of Incident: ${report.incident_date}`);
    lines.push(`Time of Incident: ${report.incident_time}`);
    lines.push(`No. Incident: ${report.incident_no}`);
    lines.push(`Location: ${report.location || (station ? station.code : "")}`);
    lines.push(`Subject: ${report.subject}`);
    lines.push(``);
    lines.push(`1. Executive Summary`);
    lines.push(report.executive_summary || "-");
    lines.push(``);
    lines.push(`2. Timeline of Events`);
    report.timeline.forEach((t) => { if (t.time || t.event) lines.push(`  ${t.time} - ${t.event}`); });
    lines.push(``);
    lines.push(`3. Probable Causes`);
    report.causes.forEach((c) => { if (c.label || c.text) lines.push(`  ${c.label}: ${c.text}`); });
    lines.push(``);
    lines.push(`4. Impact & Observations`);
    report.impact.forEach((c) => { if (c.label || c.text) lines.push(`  ${c.label}: ${c.text}`); });
    lines.push(``);
    lines.push(`Prepared by: ${report.prepared_name} (${report.prepared_role}) - ${report.prepared_date}`);
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
  };

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

  // Fixed blue headings (always shown, non-editable)
  const H = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-primary font-semibold text-base mt-4 mb-2">{children}</h3>
  );
  const Label = ({ children }: { children: React.ReactNode }) => (
    <span className="text-primary font-semibold">{children}</span>
  );

  const inputCls = "h-9 px-3 rounded-md border bg-background text-sm w-full";
  const taCls = "px-3 py-2 rounded-md border bg-background text-sm w-full";

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent">
          <Back className="h-4 w-4" /> {locale === "ar" ? "رجوع" : "Back"}
        </button>
        <div className="flex-1" />
        <button
          onClick={async () => {
            try {
              const file = await buildElementPdf({
                elementId: "incident-print-sheet",
                filename: `Incident_Report_${safeFilePart(report.incident_no || station?.code)}_${report.incident_date}.pdf`,
                minWidth: 900,
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
              const file = await exportIncidentXlsx({ station: station ?? null, equipment, reporterName, report });
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
        <button onClick={emailReport} className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent">
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

      {/* Meta */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("common.station")}</label>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            disabled={!canWrite}
            className={inputCls}
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
          <label className="text-xs text-muted-foreground">{locale === "ar" ? "المعدة" : "Equipment"}</label>
          <input value={equipment} onChange={(e) => setEquipment(e.target.value)} disabled={!canWrite} className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{locale === "ar" ? "بواسطة" : "Reported by"}</label>
          <input value={reporterName} onChange={(e) => setReporterName(e.target.value)} disabled={!canWrite} className={inputCls} />
        </div>
      </div>

      {/* Printable sheet with fixed structure */}
      <div id="incident-print-sheet" className="rounded-xl border bg-card p-6 md:p-8 print:border-0 print:shadow-none print:rounded-none print:p-0" dir="ltr">
        <div className="text-center mb-6" data-pdf-block>
          <img
            src="/wtco-logo.png"
            alt="WTCO"
            className="mx-auto mb-3 h-16 w-auto object-contain"
          />
          <div className="text-xs text-muted-foreground">Water Transmission Company</div>
          <h1 className="text-2xl font-bold mt-1">Operations Incident Report</h1>
          {stationTitle && <div className="text-sm text-muted-foreground mt-1">{stationTitle}</div>}
        </div>

        {/* Header grid — fixed blue labels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm border rounded-lg p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label>Date of Incident:</Label>
            <input
              type="date"
              value={report.incident_date}
              onChange={(e) => setReport({ ...report, incident_date: e.target.value })}
              disabled={!canWrite}
              className="h-8 px-2 border rounded bg-background flex-1 min-w-[140px] print:border-0"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label>Time of Incident:</Label>
            <input
              type="time"
              value={report.incident_time}
              onChange={(e) => setReport({ ...report, incident_time: e.target.value })}
              disabled={!canWrite}
              className="h-8 px-2 border rounded bg-background flex-1 min-w-[100px] print:border-0"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label>No. Incident:</Label>
            <input
              value={report.incident_no}
              onChange={(e) => setReport({ ...report, incident_no: e.target.value })}
              disabled={!canWrite}
              placeholder=""
              className="h-8 px-2 border rounded bg-background flex-1 min-w-[140px] print:border-0"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label>Location:</Label>
            <input
              value={report.location}
              onChange={(e) => setReport({ ...report, location: e.target.value })}
              disabled={!canWrite}
              placeholder={station?.code || ""}
              className="h-8 px-2 border rounded bg-background flex-1 min-w-[140px] print:border-0"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Label>Subject:</Label>
            <input
              value={report.subject}
              onChange={(e) => setReport({ ...report, subject: e.target.value })}
              disabled={!canWrite}
              placeholder=""
              className="h-8 px-2 border rounded bg-background flex-1 min-w-[200px] print:border-0"
            />
          </div>
        </div>

        {/* 1. Executive Summary */}
        <H>1. Executive Summary</H>
        <textarea
          value={report.executive_summary}
          onChange={(e) => setReport({ ...report, executive_summary: e.target.value })}
          disabled={!canWrite}
          rows={5}
          className={taCls + " print:border-0"}
          placeholder=""
        />

        {/* 2. Timeline */}
        <H>2. Timeline of Events</H>
        <div className="space-y-2">
          {report.timeline.map((row, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input
                value={row.time}
                onChange={(e) => {
                  const arr = [...report.timeline]; arr[i] = { ...row, time: e.target.value }; setReport({ ...report, timeline: arr });
                }}
                disabled={!canWrite}
                placeholder=""
                className="h-9 w-24 px-2 border rounded bg-background text-sm print:border-0"
              />
              <input
                value={row.event}
                onChange={(e) => {
                  const arr = [...report.timeline]; arr[i] = { ...row, event: e.target.value }; setReport({ ...report, timeline: arr });
                }}
                disabled={!canWrite}
                placeholder=""
                className="h-9 flex-1 px-2 border rounded bg-background text-sm print:border-0"
              />
              {canWrite && (
                <button
                  onClick={() => setReport({ ...report, timeline: report.timeline.filter((_, j) => j !== i) })}
                  className="p-2 rounded hover:bg-destructive/10 text-destructive print:hidden"
                  aria-label="remove"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {canWrite && (
            <button
              onClick={() => setReport({ ...report, timeline: [...report.timeline, { time: "", event: "" }] })}
              className="inline-flex items-center gap-1 text-xs text-primary print:hidden"
            >
              <Plus className="h-3 w-3" /> Add event
            </button>
          )}
        </div>

        {/* 3. Probable Causes */}
        <H>3. Probable Causes (Operational Analysis)</H>
        <LabeledList
          items={report.causes}
          onChange={(items) => setReport({ ...report, causes: items })}
          canWrite={canWrite}
          labelPlaceholder=""
          textPlaceholder=""
        />

        {/* Optional photos — positioned directly after section 3 */}
        <section className="mt-5 border-t pt-4" data-pdf-block>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-primary font-semibold text-base">Incident Photos</h3>
              <p className="text-xs text-muted-foreground">
                {locale === "ar" ? "صور الحادث (اختياري)" : "Optional — multiple photos can be attached"}
              </p>
            </div>
            {canWrite && (
              <label
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 text-sm hover:bg-accent print:hidden"
                data-pdf-hide
              >
                <Upload className="h-4 w-4" />
                {uploadFile.isPending
                  ? locale === "ar" ? "جارٍ رفع الصور…" : "Uploading…"
                  : locale === "ar" ? "إرفاق صور" : "Add photos"}
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  disabled={uploadFile.isPending}
                  onChange={async (event) => {
                    const files = Array.from(event.target.files ?? []);
                    const invalid = files.find((file) => !file.type.startsWith("image/"));
                    const oversized = files.find((file) => file.size > 10 * 1024 * 1024);
                    if (invalid) {
                      toast.error(locale === "ar" ? "اختر ملفات صور فقط" : "Please select image files only");
                    } else if (oversized) {
                      toast.error(locale === "ar" ? "حجم الصورة يجب ألا يتجاوز 10 ميجابايت" : "Each photo must be 10 MB or smaller");
                    } else {
                      for (const file of files) await uploadFile.mutateAsync(file);
                    }
                    event.target.value = "";
                  }}
                />
              </label>
            )}
          </div>

          {isNew && pendingPhotoPreviews.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pdf-photo-grid">
              {pendingPhotoPreviews.map(({ file, url }, index) => (
                <figure key={`${file.name}-${file.lastModified}-${index}`} className="relative overflow-hidden rounded-md border bg-background pdf-photo-item" data-pdf-block>
                  <img src={url} alt={file.name} className="h-56 w-full object-contain bg-muted/20" />
                  <figcaption className="truncate border-t px-3 py-2 text-xs" title={file.name}>{file.name}</figcaption>
                  <button
                    type="button"
                    onClick={() => setPendingPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}
                    className="absolute right-2 top-2 rounded-md border bg-background/90 p-1.5 text-destructive shadow-sm hover:bg-destructive/10 print:hidden"
                    aria-label={locale === "ar" ? "حذف الصورة" : "Delete photo"}
                    data-pdf-hide
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </figure>
              ))}
              <p className="text-xs text-muted-foreground sm:col-span-2 print:hidden" data-pdf-hide>
                {locale === "ar" ? "ستُرفع الصور تلقائيًا عند حفظ التقرير." : "Photos will upload automatically when the report is saved."}
              </p>
            </div>
          ) : isNew || imageAttachments.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground print:hidden" data-pdf-hide>
              {locale === "ar" ? "لا توجد صور مرفقة — يمكنك اختيار الصور قبل الحفظ، والإرفاق غير إلزامي." : "No photos attached — you can select photos before saving, and photos are optional."}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pdf-photo-grid">
              {imageAttachments.map((attachment) => {
                const url = signedUrls[attachment.storage_path];
                return (
                  <figure
                    key={attachment.id}
                    className="relative overflow-hidden rounded-md border bg-background pdf-photo-item"
                    data-pdf-block
                  >
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="block">
                        <img
                          src={url}
                          alt={attachment.file_name}
                          crossOrigin="anonymous"
                          className="h-56 w-full object-contain bg-muted/20"
                        />
                      </a>
                    ) : (
                      <div className="flex h-56 items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-10 w-10" />
                      </div>
                    )}
                    <figcaption className="truncate border-t px-3 py-2 text-xs" title={attachment.file_name}>
                      {attachment.file_name}
                    </figcaption>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(locale === "ar" ? "حذف الصورة؟" : "Delete photo?")) removeAttachment.mutate(attachment);
                        }}
                        className="absolute right-2 top-2 rounded-md border bg-background/90 p-1.5 text-destructive shadow-sm hover:bg-destructive/10 print:hidden"
                        aria-label={locale === "ar" ? "حذف الصورة" : "Delete photo"}
                        data-pdf-hide
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </figure>
                );
              })}
            </div>
          )}
        </section>

        {/* 4. Impact & Observations */}
        <H>4. Impact & Observations</H>
        <LabeledList
          items={report.impact}
          onChange={(items) => setReport({ ...report, impact: items })}
          canWrite={canWrite}
          labelPlaceholder=""
          textPlaceholder=""
        />

        {/* 5. Prepared by */}
        <H>5. Prepared by</H>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            value={report.prepared_name}
            onChange={(e) => setReport({ ...report, prepared_name: e.target.value })}
            disabled={!canWrite}
            placeholder=""
            className="h-9 px-2 border rounded bg-background text-sm print:border-0"
          />
          <input
            value={report.prepared_role}
            onChange={(e) => setReport({ ...report, prepared_role: e.target.value })}
            disabled={!canWrite}
            placeholder=""
            className="h-9 px-2 border rounded bg-background text-sm print:border-0"
          />
          <input
            type="date"
            value={report.prepared_date}
            onChange={(e) => setReport({ ...report, prepared_date: e.target.value })}
            disabled={!canWrite}
            className="h-9 px-2 border rounded bg-background text-sm print:border-0"
          />
        </div>

        {/* Legacy non-image attachments remain available without mixing them into the photo report. */}
        {fileAttachments.length > 0 && (
          <section className="mt-5 border-t pt-4" data-pdf-block>
            <H>Other Attachments</H>
            <div className="space-y-2">
              {fileAttachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <a className="min-w-0 flex-1 truncate text-primary underline" href={signedUrls[attachment.storage_path]} target="_blank" rel="noreferrer">
                    {attachment.file_name}
                  </a>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(locale === "ar" ? "حذف المرفق؟" : "Delete attachment?")) removeAttachment.mutate(attachment);
                      }}
                      className="rounded p-1 text-destructive hover:bg-destructive/10 print:hidden"
                      aria-label={locale === "ar" ? "حذف المرفق" : "Delete attachment"}
                      data-pdf-hide
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-8 text-[10px] text-center text-muted-foreground border-t pt-2">
          WTCO Information Classification: Public
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #incident-print-sheet, #incident-print-sheet * { visibility: visible; }
          #incident-print-sheet { position: absolute; inset: 0; padding: 16mm; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}

async function exportIncidentXlsx(opts: {
  station: Station | null;
  equipment: string;
  reporterName: string;
  report: ReportData;
}) {
  const { station, equipment, reporterName, report } = opts;
  const ExcelJS = (await import("exceljs")) as any;
  const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook;
  if (!Workbook) throw new Error("Excel engine not loaded");
  const wb = new Workbook();
  wb.creator = "WTCO";
  wb.created = new Date();
  const ws = wb.addWorksheet("Incident Report", {
    pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [{ width: 24 }, { width: 74 }];
  ws.mergeCells("A1:B1");
  ws.getCell("A1").value = "OPERATIONS INCIDENT REPORT";
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF1F4E78" } };
  ws.getCell("A1").alignment = { horizontal: "center" };

  const rows: Array<[string, string]> = [
    ["Station", station ? `${station.code} - ${station.name_en}` : ""],
    ["Equipment", equipment],
    ["Reported by", reporterName],
    ["Date of Incident", report.incident_date],
    ["Time of Incident", report.incident_time],
    ["No. Incident", report.incident_no],
    ["Location", report.location],
    ["Subject", report.subject],
    ["Executive Summary", report.executive_summary],
    ["Timeline of Events", report.timeline.map((t) => `${t.time || "—"} - ${t.event || "—"}`).join("\n")],
    ["Probable Causes", report.causes.map((c) => `${c.label || "—"}: ${c.text || "—"}`).join("\n")],
    ["Impact & Observations", report.impact.map((c) => `${c.label || "—"}: ${c.text || "—"}`).join("\n")],
    ["Prepared by", `${report.prepared_name} (${report.prepared_role}) - ${report.prepared_date}`],
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
    if (row[1].length > 120) r.height = Math.min(160, 24 + Math.ceil(row[1].length / 80) * 15);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = createExcelBlob(buffer);
  return {
    blob,
    filename: `Incident_Report_${safeFilePart(report.incident_no || station?.code)}_${report.incident_date}.xlsx`,
  };
}

function LabeledList({
  items,
  onChange,
  canWrite,
  labelPlaceholder,
  textPlaceholder,
}: {
  items: LabeledItem[];
  onChange: (items: LabeledItem[]) => void;
  canWrite: boolean;
  labelPlaceholder: string;
  textPlaceholder: string;
}) {
  return (
    <div className="space-y-3">
      {items.map((row, i) => (
        <div key={i} className="rounded-md border p-3 space-y-2 relative">
          <input
            value={row.label}
            onChange={(e) => {
              const arr = [...items]; arr[i] = { ...row, label: e.target.value }; onChange(arr);
            }}
            disabled={!canWrite}
            placeholder={labelPlaceholder}
            className="h-8 w-full px-2 border-0 border-b bg-transparent text-sm font-semibold focus:outline-none"
          />
          <textarea
            value={row.text}
            onChange={(e) => {
              const arr = [...items]; arr[i] = { ...row, text: e.target.value }; onChange(arr);
            }}
            disabled={!canWrite}
            rows={2}
            placeholder={textPlaceholder}
            className="w-full px-2 py-1 border rounded bg-background text-sm print:border-0"
          />
          {canWrite && (
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="absolute top-2 right-2 p-1 rounded hover:bg-destructive/10 text-destructive print:hidden"
              aria-label="remove"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {canWrite && (
        <button
          onClick={() => onChange([...items, { label: "", text: "" }])}
          className="inline-flex items-center gap-1 text-xs text-primary print:hidden"
        >
          <Plus className="h-3 w-3" /> Add item
        </button>
      )}
    </div>
  );
}
