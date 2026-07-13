import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
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
} from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({
  id: z.string().optional(),
  station: z.string().optional(),
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
  line1_label: string;
  line1_mp1: string | null;
  line1_mp2: string | null;
  line1_mp3: string | null;
  line1_mp4: string | null;
  line1_inlet: string | null;
  line1_outlet: string | null;
  line1_flow: string | null;
  line1_svs: string | null;
  line2_label: string;
  line2_mp1: string | null;
  line2_mp2: string | null;
  line2_mp3: string | null;
  line2_mp4: string | null;
  line2_inlet: string | null;
  line2_outlet: string | null;
  line2_flow: string | null;
  line2_svs: string | null;
  remarks: string[];
  reported_by: string | null;
  operator_id: string | null;
  created_at: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
      return data as ShiftReport[];
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

function shiftLabel(s: "day" | "night", locale: "ar" | "en") {
  if (s === "day") return locale === "ar" ? "نهاري (6ص - 6م)" : "Day (6am - 6pm)";
  return locale === "ar" ? "ليلي (6م - 6ص)" : "Night (6pm - 6am)";
}

/* ============================ EDITOR ============================ */

const EMPTY: Omit<ShiftReport, "id" | "created_at" | "operator_id" | "station_id"> = {
  report_date: todayISO(),
  shift: "day",
  line1_label: "LINE A/B",
  line1_mp1: "",
  line1_mp2: "",
  line1_mp3: "",
  line1_mp4: "",
  line1_inlet: "",
  line1_outlet: "",
  line1_flow: "",
  line1_svs: "",
  line2_label: "LINE G",
  line2_mp1: "",
  line2_mp2: "",
  line2_mp3: "",
  line2_mp4: "",
  line2_inlet: "",
  line2_outlet: "",
  line2_flow: "",
  line2_svs: "",
  remarks: ["", "", "", "", ""],
  reported_by: "",
};

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
      return data as ShiftReport;
    },
  });

  const [stationId, setStationId] = useState<string>(profile?.station_id ?? "");
  const [form, setForm] = useState({ ...EMPTY });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (isNew) {
      setStationId(profile?.station_id ?? "");
      setForm({ ...EMPTY, reported_by: profile?.full_name ?? "" });
      setHydrated(true);
      return;
    }
    if (!existing) return;
    setStationId(existing.station_id);
    setForm({
      report_date: existing.report_date,
      shift: existing.shift,
      line1_label: existing.line1_label,
      line1_mp1: existing.line1_mp1 ?? "",
      line1_mp2: existing.line1_mp2 ?? "",
      line1_mp3: existing.line1_mp3 ?? "",
      line1_mp4: existing.line1_mp4 ?? "",
      line1_inlet: existing.line1_inlet ?? "",
      line1_outlet: existing.line1_outlet ?? "",
      line1_flow: existing.line1_flow ?? "",
      line1_svs: existing.line1_svs ?? "",
      line2_label: existing.line2_label,
      line2_mp1: existing.line2_mp1 ?? "",
      line2_mp2: existing.line2_mp2 ?? "",
      line2_mp3: existing.line2_mp3 ?? "",
      line2_mp4: existing.line2_mp4 ?? "",
      line2_inlet: existing.line2_inlet ?? "",
      line2_outlet: existing.line2_outlet ?? "",
      line2_flow: existing.line2_flow ?? "",
      line2_svs: existing.line2_svs ?? "",
      remarks: existing.remarks.length ? existing.remarks : ["", "", "", "", ""],
      reported_by: existing.reported_by ?? "",
    });
    setHydrated(true);
  }, [isNew, existing, profile?.station_id, profile?.full_name]);

  const save = useMutation({
    mutationFn: async () => {
      if (!stationId) throw new Error(locale === "ar" ? "اختر المحطة" : "Pick a station");
      const payload = {
        ...form,
        station_id: stationId,
        remarks: form.remarks.map((r) => r.trim()).filter(Boolean),
      };
      if (isNew) {
        const { data, error } = await supabase
          .from("shift_reports")
          .insert({ ...payload, operator_id: profile?.id })
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
      if (isNew) {
        // switch to edit-mode url without reload
        window.history.replaceState({}, "", `?id=${newId}`);
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const station = useMemo(
    () => (stations ?? []).find((s) => s.id === stationId),
    [stations, stationId],
  );

  const emailReport = () => {
    const subject = `Shift Report - ${form.report_date} - ${shiftLabel(form.shift, "en")}${
      station ? " - " + station.code : ""
    }`;
    const body = buildPlainText(form, station, locale);
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
    station && (station.code + " · " + (locale === "ar" ? station.name_ar : station.name_en));

  return (
    <div className="space-y-5">
      {/* Toolbar — hidden on print */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent"
        >
          <Back className="h-4 w-4" /> {locale === "ar" ? "رجوع" : "Back"}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent"
        >
          <Printer className="h-4 w-4" />
          {locale === "ar" ? "طباعة / PDF" : "Print / PDF"}
        </button>
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

      {/* Meta inputs — hidden on print */}
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
            value={form.reported_by ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, reported_by: e.target.value }))}
            disabled={!canWrite}
            className="h-10 px-3 rounded-lg border bg-background text-sm"
          />
        </div>
      </div>

      {/* Printable sheet */}
      <div
        id="print-sheet"
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

        <LineBlock
          label={form.line1_label}
          onLabel={(v) => setForm((f) => ({ ...f, line1_label: v }))}
          fields={{
            mp1: form.line1_mp1 ?? "",
            mp2: form.line1_mp2 ?? "",
            mp3: form.line1_mp3 ?? "",
            mp4: form.line1_mp4 ?? "",
            inlet: form.line1_inlet ?? "",
            outlet: form.line1_outlet ?? "",
            flow: form.line1_flow ?? "",
            svs: form.line1_svs ?? "",
          }}
          onField={(k, v) =>
            setForm((f) => ({
              ...f,
              [`line1_${k}`]: v,
            }))
          }
          disabled={!canWrite}
        />

        <div className="h-4" />

        <LineBlock
          label={form.line2_label}
          onLabel={(v) => setForm((f) => ({ ...f, line2_label: v }))}
          fields={{
            mp1: form.line2_mp1 ?? "",
            mp2: form.line2_mp2 ?? "",
            mp3: form.line2_mp3 ?? "",
            mp4: form.line2_mp4 ?? "",
            inlet: form.line2_inlet ?? "",
            outlet: form.line2_outlet ?? "",
            flow: form.line2_flow ?? "",
            svs: form.line2_svs ?? "",
          }}
          onField={(k, v) =>
            setForm((f) => ({
              ...f,
              [`line2_${k}`]: v,
            }))
          }
          disabled={!canWrite}
        />

        <div className="mt-6">
          <h3 className="font-bold text-sm mb-2 uppercase">Activities / Remarks:</h3>
          <ul className="space-y-1.5">
            {form.remarks.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2 h-1 w-1 rounded-full bg-foreground shrink-0 print:bg-black" />
                <input
                  value={r}
                  onChange={(e) =>
                    setForm((f) => {
                      const arr = [...f.remarks];
                      arr[i] = e.target.value;
                      return { ...f, remarks: arr };
                    })
                  }
                  disabled={!canWrite}
                  placeholder={locale === "ar" ? "…" : "…"}
                  className="flex-1 h-8 px-1 border-b bg-transparent text-sm focus:outline-none focus:border-primary print:border-b print:border-black"
                />
              </li>
            ))}
          </ul>
          {canWrite && (
            <button
              onClick={() =>
                setForm((f) => ({ ...f, remarks: [...f.remarks, ""] }))
              }
              className="mt-2 text-xs text-primary hover:underline print:hidden"
            >
              + {locale === "ar" ? "إضافة سطر" : "Add line"}
            </button>
          )}
        </div>

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

      {/* Print rules */}
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white !important; }
          aside, header, nav, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          #print-sheet { color: black !important; }
          #print-sheet input { border: none !important; background: transparent !important; color: black !important; padding: 0 !important; height: auto !important; }
        }
      `}</style>
    </div>
  );
}

/* ============================ LINE BLOCK ============================ */

interface LineFields {
  mp1: string; mp2: string; mp3: string; mp4: string;
  inlet: string; outlet: string; flow: string; svs: string;
}

function LineBlock({
  label,
  onLabel,
  fields,
  onField,
  disabled,
}: {
  label: string;
  onLabel: (v: string) => void;
  fields: LineFields;
  onField: (k: keyof LineFields, v: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="border rounded-lg overflow-hidden print:border-black print:rounded-none">
      <div className="bg-primary/10 px-4 py-2 print:bg-transparent print:border-b print:border-black">
        <input
          value={label}
          onChange={(e) => onLabel(e.target.value)}
          disabled={disabled}
          className="w-full bg-transparent text-base font-bold uppercase tracking-wide focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 p-4 text-sm print:gap-y-1 print:p-3">
        <Row label="MP 1"           value={fields.mp1}    onChange={(v) => onField("mp1", v)}    disabled={disabled} />
        <Row label="Inlet Pressure" value={fields.inlet}  onChange={(v) => onField("inlet", v)}  disabled={disabled} />
        <Row label="MP 2"           value={fields.mp2}    onChange={(v) => onField("mp2", v)}    disabled={disabled} />
        <Row label="Outlet Pressure" value={fields.outlet} onChange={(v) => onField("outlet", v)} disabled={disabled} />
        <Row label="MP 3"           value={fields.mp3}    onChange={(v) => onField("mp3", v)}    disabled={disabled} />
        <Row label="Flow"           value={fields.flow}   onChange={(v) => onField("flow", v)}   disabled={disabled} />
        <Row label="MP 4"           value={fields.mp4}    onChange={(v) => onField("mp4", v)}    disabled={disabled} />
        <Row label="SVS Status"     value={fields.svs}    onChange={(v) => onField("svs", v)}    disabled={disabled} />
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="mt-0.5 h-1 w-1 rounded-full bg-foreground shrink-0 print:bg-black" />
      <span className="font-medium w-[140px] shrink-0">{label}:</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex-1 h-8 px-1 border-b bg-transparent focus:outline-none focus:border-primary print:border-b print:border-black"
      />
    </div>
  );
}

/* ============================ EMAIL TEXT ============================ */

function buildPlainText(
  f: typeof EMPTY,
  station: Station | undefined,
  locale: "ar" | "en",
) {
  const s = station ? `${station.code} - ${locale === "ar" ? station.name_ar : station.name_en}` : "";
  const line = (label: string, v: string) => `• ${label}: ${v || "—"}`;
  return [
    `${s} Shift Report`,
    ``,
    `Date: ${f.report_date}`,
    `Shift: ${shiftLabel(f.shift, "en")}`,
    ``,
    f.line1_label,
    line("MP 1", f.line1_mp1 ?? ""),
    line("MP 2", f.line1_mp2 ?? ""),
    line("MP 3", f.line1_mp3 ?? ""),
    line("MP 4", f.line1_mp4 ?? ""),
    line("Inlet Pressure", f.line1_inlet ?? ""),
    line("Outlet Pressure", f.line1_outlet ?? ""),
    line("Flow", f.line1_flow ?? ""),
    line("SVS Status", f.line1_svs ?? ""),
    ``,
    f.line2_label,
    line("MP 1", f.line2_mp1 ?? ""),
    line("MP 2", f.line2_mp2 ?? ""),
    line("MP 3", f.line2_mp3 ?? ""),
    line("MP 4", f.line2_mp4 ?? ""),
    line("Inlet Pressure", f.line2_inlet ?? ""),
    line("Outlet Pressure", f.line2_outlet ?? ""),
    line("Flow", f.line2_flow ?? ""),
    line("SVS Status", f.line2_svs ?? ""),
    ``,
    `Activities / Remarks:`,
    ...f.remarks.filter((r) => r.trim()).map((r) => `• ${r}`),
    ``,
    `Reported by: ${f.reported_by ?? ""}`,
  ].join("\n");
}
