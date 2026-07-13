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
  X,
} from "lucide-react";
import { z } from "zod";

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

interface Extra {
  label: string;
  value: string;
}

interface Line {
  label: string;
  pumps: string[];
  inlet: string;
  outlet: string;
  flow: string;
  svs: string;
  extras?: Extra[];
}

interface ShiftReport {
  id: string;
  station_id: string;
  report_date: string;
  shift: "day" | "night";
  lines: Line[];
  remarks: string[];
  reported_by: string | null;
  operator_id: string | null;
  created_at: string;
}

interface TplSection {
  id: string;
  name_en: string;
  name_ar: string | null;
  sort_order: number;
}
interface TplField {
  id: string;
  section_id: string | null;
  label_en: string;
  label_ar: string | null;
  unit: string | null;
  sort_order: number;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/* Build lines from a station's reading template (sections + fields). */
function linesFromTemplate(sections: TplSection[], fields: TplField[]): Line[] {
  const bySection: Record<string, TplField[]> = {};
  const orphan: TplField[] = [];
  for (const f of fields) {
    if (f.section_id) (bySection[f.section_id] ??= []).push(f);
    else orphan.push(f);
  }
  const mk = (label: string, fs: TplField[]): Line => {
    const line: Line = {
      label,
      pumps: [],
      inlet: "",
      outlet: "",
      flow: "",
      svs: "",
      extras: [],
    };
    const sorted = fs.slice().sort((a, b) => a.sort_order - b.sort_order);
    for (const f of sorted) {
      const l = f.label_en.toLowerCase();
      if (/^\s*(mp|pump)\b/i.test(f.label_en) || /pump/i.test(l)) {
        line.pumps.push("");
      } else if (l.includes("inlet")) line.inlet = "";
      else if (l.includes("outlet") || l.includes("discharge")) line.outlet = "";
      else if (l.includes("flow")) line.flow = "";
      else if (l.includes("svs")) line.svs = "";
      else line.extras!.push({ label: f.label_en, value: "" });
    }
    if (line.pumps.length === 0 && line.extras!.length === 0) {
      line.pumps = Array(4).fill("");
    }
    return line;
  };
  const result: Line[] = sections
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => mk(s.name_en, bySection[s.id] ?? []));
  if (orphan.length > 0) result.unshift(mk("GENERAL", orphan));
  return result.length > 0 ? result : [mk("LINE 1", [])];
}

/* Fallback: derive default lines from station code — e.g. PS1_AB → LINE A + LINE B */
function defaultLinesFor(code: string | undefined): Line[] {
  const mkLine = (label: string, pumpCount = 4): Line => ({
    label,
    pumps: Array(pumpCount).fill(""),
    inlet: "",
    outlet: "",
    flow: "",
    svs: "",
    extras: [],
  });
  if (!code) return [mkLine("LINE 1")];
  const suffix = code.split("_").pop()?.toUpperCase() ?? "";
  const letters = suffix.split("");
  if (letters.length === 0) return [mkLine("LINE 1")];
  return letters.map((l) => mkLine(`LINE ${l}`));
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

function shiftLabel(s: "day" | "night", locale: "ar" | "en") {
  if (s === "day") return locale === "ar" ? "نهاري (6ص - 6م)" : "Day (6am - 6pm)";
  return locale === "ar" ? "ليلي (6م - 6ص)" : "Night (6pm - 6am)";
}

/* ============================ EDITOR ============================ */

interface FormState {
  report_date: string;
  shift: "day" | "night";
  mode: "structured" | "free";
  body: string;
  lines: Line[];
  remarks: string[];
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
    mode: "structured",
    body: "",
    lines: [],
    remarks: ["", "", "", "", ""],
    reported_by: "",
  }));
  const [hydrated, setHydrated] = useState(false);

  const stationMap = useMemo(() => {
    const m: Record<string, Station> = {};
    for (const s of stations ?? []) m[s.id] = s;
    return m;
  }, [stations]);

  // Hydrate on first load
  useEffect(() => {
    if (isNew) {
      const sid = profile?.station_id ?? "";
      setStationId(sid);
      setHydrated(true);
      return;
    }
    if (!existing) return;
    setStationId(existing.station_id);
    const existingLines = (existing.lines ?? []).map(normalizeLine);
    const isFree = existingLines.length === 0;
    setForm({
      report_date: existing.report_date,
      shift: existing.shift,
      mode: isFree ? "free" : "structured",
      body: isFree ? (existing.remarks ?? []).join("\n") : "",
      lines: existingLines,
      remarks: !isFree && existing.remarks.length ? existing.remarks : ["", "", "", "", ""],
      reported_by: existing.reported_by ?? "",
    });
    setHydrated(true);
  }, [isNew, existing, profile?.station_id]);

  // For new reports: whenever station is picked (and no lines yet), preset lines
  // from that station's active reading template. Fall back to code-based lines
  // if the station has no template configured yet.
  const { data: tplData } = useQuery({
    queryKey: ["station-template-shape", stationId],
    enabled: isNew && hydrated && !!stationId && form.mode === "structured" && form.lines.length === 0,
    queryFn: async () => {
      const tpl = await supabase
        .from("reading_templates")
        .select("id")
        .eq("station_id", stationId)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (tpl.error) throw tpl.error;
      if (!tpl.data) return { sections: [] as TplSection[], fields: [] as TplField[] };
      const [secRes, fldRes] = await Promise.all([
        supabase
          .from("reading_sections")
          .select("id, name_en, name_ar, sort_order")
          .eq("template_id", tpl.data.id)
          .order("sort_order"),
        supabase
          .from("reading_fields")
          .select("id, section_id, label_en, label_ar, unit, sort_order")
          .eq("template_id", tpl.data.id)
          .order("sort_order"),
      ]);
      if (secRes.error) throw secRes.error;
      if (fldRes.error) throw fldRes.error;
      return {
        sections: (secRes.data ?? []) as TplSection[],
        fields: (fldRes.data ?? []) as TplField[],
      };
    },
  });

  useEffect(() => {
    if (!isNew || !hydrated) return;
    if (form.lines.length > 0) return;
    if (!stationId) return;
    let next: Line[] | null = null;
    if (tplData) {
      if (tplData.sections.length > 0 || tplData.fields.length > 0) {
        next = linesFromTemplate(tplData.sections, tplData.fields);
      } else {
        next = defaultLinesFor(stationMap[stationId]?.code);
      }
    }
    if (!next) return;
    setForm((f) => ({
      ...f,
      lines: next!,
      reported_by: f.reported_by || profile?.full_name || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, hydrated, stationId, tplData, stationMap]);

  const save = useMutation({
    mutationFn: async () => {
      if (!stationId) throw new Error(locale === "ar" ? "اختر المحطة" : "Pick a station");
      const payload = {
        station_id: stationId,
        report_date: form.report_date,
        shift: form.shift,
        lines:
          form.mode === "free" ? [] : JSON.parse(JSON.stringify(form.lines)),
        remarks:
          form.mode === "free"
            ? form.body.trim()
              ? [form.body]
              : []
            : form.remarks.map((r) => r.trim()).filter(Boolean),
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
    station && `${station.code} · ${locale === "ar" ? station.name_ar : station.name_en}`;

  const updateLine = (i: number, patch: Partial<Line>) => {
    setForm((f) => {
      const arr = [...f.lines];
      arr[i] = { ...arr[i], ...patch };
      return { ...f, lines: arr };
    });
  };

  const setPump = (li: number, pi: number, v: string) => {
    setForm((f) => {
      const arr = f.lines.map((l) => ({ ...l, pumps: [...l.pumps] }));
      arr[li].pumps[pi] = v;
      return { ...f, lines: arr };
    });
  };

  const addPump = (li: number) =>
    updateLine(li, { pumps: [...form.lines[li].pumps, ""] });
  const removePump = (li: number) => {
    if (form.lines[li].pumps.length <= 1) return;
    updateLine(li, { pumps: form.lines[li].pumps.slice(0, -1) });
  };

  const addLine = () =>
    setForm((f) => ({
      ...f,
      lines: [
        ...f.lines,
        { label: `LINE ${f.lines.length + 1}`, pumps: ["", "", "", ""], inlet: "", outlet: "", flow: "", svs: "" },
      ],
    }));

  const removeLine = (i: number) =>
    setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));

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

        {form.lines.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">
            {locale === "ar" ? "اختر محطة لتحميل الخطوط" : "Pick a station to load lines"}
          </div>
        ) : (
          <div className="space-y-4">
            {form.lines.map((line, li) => (
              <LineBlock
                key={li}
                line={line}
                onChange={(patch) => updateLine(li, patch)}
                onSetPump={(pi, v) => setPump(li, pi, v)}
                onAddPump={() => addPump(li)}
                onRemovePump={() => removePump(li)}
                onRemove={() => removeLine(li)}
                disabled={!canWrite}
                locale={locale}
              />
            ))}
          </div>
        )}

        {canWrite && (
          <button
            onClick={addLine}
            className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline print:hidden"
          >
            <Plus className="h-4 w-4" /> {locale === "ar" ? "إضافة خط" : "Add line"}
          </button>
        )}

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
                  placeholder="…"
                  className="flex-1 h-8 px-1 border-b bg-transparent text-sm focus:outline-none focus:border-primary print:border-b print:border-black"
                />
              </li>
            ))}
          </ul>
          {canWrite && (
            <button
              onClick={() => setForm((f) => ({ ...f, remarks: [...f.remarks, ""] }))}
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

      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: white !important; }
          aside, header, nav, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          #print-sheet { color: black !important; }
          #print-sheet input, #print-sheet select { border: none !important; background: transparent !important; color: black !important; padding: 0 !important; height: auto !important; -webkit-appearance: none; appearance: none; }
        }
      `}</style>
    </div>
  );
}

/* ============================ LINE BLOCK ============================ */

function normalizeLine(l: Line): Line {
  return {
    label: l.label ?? "LINE",
    pumps: Array.isArray(l.pumps) ? l.pumps.map((p) => p ?? "") : [],
    inlet: l.inlet ?? "",
    outlet: l.outlet ?? "",
    flow: l.flow ?? "",
    svs: l.svs ?? "",
    extras: Array.isArray(l.extras)
      ? l.extras.map((e) => ({ label: e.label ?? "", value: e.value ?? "" }))
      : [],
  };
}

function LineBlock({
  line,
  onChange,
  onSetPump,
  onAddPump,
  onRemovePump,
  onRemove,
  disabled,
  locale,
}: {
  line: Line;
  onChange: (patch: Partial<Line>) => void;
  onSetPump: (pi: number, v: string) => void;
  onAddPump: () => void;
  onRemovePump: () => void;
  onRemove: () => void;
  disabled: boolean;
  locale: "ar" | "en";
}) {
  return (
    <section className="border rounded-lg overflow-hidden print:border-black print:rounded-none">
      <div className="bg-primary/10 px-4 py-2 print:bg-transparent print:border-b print:border-black flex items-center gap-2">
        <input
          value={line.label}
          onChange={(e) => onChange({ label: e.target.value })}
          disabled={disabled}
          className="flex-1 bg-transparent text-base font-bold uppercase tracking-wide focus:outline-none"
        />
        {!disabled && (
          <button
            onClick={onRemove}
            className="text-destructive p-1 rounded hover:bg-destructive/10 print:hidden"
            aria-label="remove line"
            title={locale === "ar" ? "حذف الخط" : "Remove line"}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 p-4 text-sm print:gap-y-1 print:p-3">
        {/* Pumps column */}
        <div className="space-y-2 print:space-y-1">
          {line.pumps.map((p, pi) => (
            <Row
              key={pi}
              label={`MP ${pi + 1}`}
              value={p}
              onChange={(v) => onSetPump(pi, v)}
              disabled={disabled}
            />
          ))}
          {!disabled && (
            <div className="flex gap-2 print:hidden pt-1">
              <button
                onClick={onAddPump}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> {locale === "ar" ? "إضافة مضخة" : "Add pump"}
              </button>
              {line.pumps.length > 1 && (
                <button
                  onClick={onRemovePump}
                  className="text-xs text-destructive hover:underline"
                >
                  − {locale === "ar" ? "حذف الأخيرة" : "Remove last"}
                </button>
              )}
            </div>
          )}
        </div>
        {/* Other fields column */}
        <div className="space-y-2 print:space-y-1">
          <Row label="Inlet Pressure" value={line.inlet} onChange={(v) => onChange({ inlet: v })} disabled={disabled} />
          <Row label="Outlet Pressure" value={line.outlet} onChange={(v) => onChange({ outlet: v })} disabled={disabled} />
          <Row label="Flow" value={line.flow} onChange={(v) => onChange({ flow: v })} disabled={disabled} />
          <Row label="SVS Status" value={line.svs} onChange={(v) => onChange({ svs: v })} disabled={disabled} />
          {(line.extras ?? []).map((ex, ei) => (
            <Row
              key={`ex-${ei}`}
              label={ex.label}
              value={ex.value}
              onChange={(v) => {
                const next = (line.extras ?? []).map((e, i) =>
                  i === ei ? { ...e, value: v } : e,
                );
                onChange({ extras: next });
              }}
              disabled={disabled}
            />
          ))}
        </div>
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

function buildPlainText(f: FormState, station: Station | undefined, locale: "ar" | "en") {
  const s = station ? `${station.code} - ${locale === "ar" ? station.name_ar : station.name_en}` : "";
  const bullet = (label: string, v: string) => `• ${label}: ${v || "—"}`;
  const lines: string[] = [`${s} Shift Report`, ``, `Date: ${f.report_date}`, `Shift: ${shiftLabel(f.shift, "en")}`, ``];
  for (const ln of f.lines) {
    lines.push(ln.label);
    ln.pumps.forEach((p, i) => lines.push(bullet(`MP ${i + 1}`, p)));
    lines.push(bullet("Inlet Pressure", ln.inlet));
    lines.push(bullet("Outlet Pressure", ln.outlet));
    lines.push(bullet("Flow", ln.flow));
    lines.push(bullet("SVS Status", ln.svs));
    for (const ex of ln.extras ?? []) lines.push(bullet(ex.label, ex.value));
    lines.push("");
  }
  lines.push(`Activities / Remarks:`);
  lines.push(...f.remarks.filter((r) => r.trim()).map((r) => `• ${r}`));
  lines.push("");
  lines.push(`Reported by: ${f.reported_by}`);
  return lines.join("\n");
}
