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
  Zap,
  Trash2,
  FileSpreadsheet,
} from "lucide-react";
import { z } from "zod";
import {
  buildElementPdf,
  createExcelBlob,
  safeFilePart,
  triggerBlobDownload,
  type DownloadLink,
} from "@/lib/export-utils";

const searchSchema = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/_app/generator")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Emergency Diesel Generator Test Run | WTCO" },
      {
        name: "description",
        content:
          "Weekly test run logsheet for the emergency diesel generator: before starting, during running and after stopping readings with remarks.",
      },
      { property: "og:title", content: "Emergency Diesel Generator Test Run" },
      {
        property: "og:description",
        content: "Record and export the weekly emergency diesel generator test run logsheet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GeneratorPage,
});

/* ============================ FORM MODEL ============================ */

type FieldKind = "open_close" | "ok_notok" | "auto_man" | "auto_man_off" | "text";

interface FieldDef {
  key: string;
  group?: string;
  label: string;
  kind: FieldKind;
  unit?: string;
}

interface SectionDef {
  key: string;
  title: string;
  hint: string;
  hintAr: string;
  fields: FieldDef[];
}

const OPTIONS: Record<Exclude<FieldKind, "text">, string[]> = {
  open_close: ["OPEN", "CLOSE"],
  ok_notok: ["OK", "NOT OK"],
  auto_man: ["AUTO", "MANUAL"],
  auto_man_off: ["AUTO", "MANUAL", "OFF"],
};

const GEN = "EMERGENCY DIESEL GENERATOR";

const SECTIONS: SectionDef[] = [
  {
    key: "before",
    title: "BEFORE STARTING",
    hint: "Verify fuel level, lubrication oil and cooling water. Ensure all valves are in the correct standby positions. Confirm the daily fuel tank (200 L) is adequate.",
    hintAr:
      "تأكد من مستوى الوقود وزيت التزييت ومياه التبريد، ومن وضع جميع الصمامات في وضع الاستعداد الصحيح، ومن كفاية خزان الوقود اليومي (200 لتر).",
    fields: [
      { key: "b_hourmeter", group: GEN, label: "HOUR METER COUNTER", kind: "text", unit: "HRS" },
      { key: "b_battery", group: GEN, label: "BATTERY VOLT", kind: "text", unit: "VOLT" },
      { key: "b_diesel_level", group: GEN, label: "DIESEL TANK LEVEL", kind: "ok_notok" },
      { key: "b_lube_level", group: GEN, label: "LUBE OIL LEVEL", kind: "ok_notok" },
      { key: "b_fuel_inlet", group: GEN, label: "GENSET FUEL INLET VALVE", kind: "open_close" },
      { key: "b_fuel_outlet", group: GEN, label: "GENSET FUEL OUTLET VALVE", kind: "open_close" },
      { key: "b_mode", label: "TESTING MODE", kind: "auto_man" },
    ],
  },
  {
    key: "during",
    title: "DURING RUNNING",
    hint: "While the genset is operating",
    hintAr: "أثناء تشغيل المولد",
    fields: [
      { key: "d_voltage", group: GEN, label: "VOLTAGES", kind: "text", unit: "VOLT" },
      { key: "d_frequency", group: GEN, label: "FREQUENCY", kind: "text", unit: "HZ" },
      { key: "d_speed", group: GEN, label: "GENSET SPEED", kind: "text", unit: "RPM" },
      { key: "d_start_time", label: "STARTING TIME", kind: "text", unit: "MIN" },
    ],
  },
  {
    key: "after",
    title: "AFTER STOPPING",
    hint: "Shut down the genset per standard procedure, reset all valves to standby position and record remarks (normal / abnormal).",
    hintAr:
      "أوقف المولد حسب الإجراء المعتمد، أعد الصمامات إلى وضع الاستعداد، وسجّل الملاحظات (طبيعي / غير طبيعي).",
    fields: [
      { key: "a_hourmeter", group: GEN, label: "HOUR METER COUNTER", kind: "text", unit: "HRS" },
      { key: "a_battery", group: GEN, label: "BATTERY VOLTAGE", kind: "text", unit: "VOLT" },
      { key: "a_fuel_inlet", group: GEN, label: "GENSET FUEL INLET VALVE", kind: "open_close" },
      { key: "a_fuel_outlet", group: GEN, label: "GENSET FUEL OUTLET VALVE", kind: "open_close" },
      { key: "a_selector", group: GEN, label: "SELECTOR MODE", kind: "auto_man_off" },
      { key: "a_stop_time", label: "STOPPING TIME", kind: "text", unit: "HRS" },
    ],
  },
];

interface TestData {
  values: Record<string, string>;
  remarks: string;
}

function emptyData(): TestData {
  return { values: {}, remarks: "" };
}

interface Station {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
}

interface GeneratorTest {
  id: string;
  station_id: string;
  test_date: string;
  genset_tag: string | null;
  data: unknown;
  supervisor_notes: string | null;
  supervisor_name: string | null;
  operator_name: string | null;
  created_at: string;
  created_by: string | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function GeneratorPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/generator" });
  if (search.id) {
    return <EditorView id={search.id} onBack={() => navigate({ search: {} })} />;
  }
  return (
    <ListView
      onNew={() => navigate({ search: { id: "new" } })}
      onOpen={(id) => navigate({ search: { id } })}
    />
  );
}

/* ============================ LIST ============================ */

function ListView({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const { locale, t } = useI18n();
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [stationFilter, setStationFilter] = useState<string>("");

  const { data: stations } = useScopedStations();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["generator-tests", stationFilter || "all"],
    queryFn: async () => {
      let q = supabase
        .from("generator_tests")
        .select("*")
        .order("test_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (stationFilter) q = q.eq("station_id", stationFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as GeneratorTest[];
    },
  });

  const stationMap = useMemo(() => {
    const m: Record<string, Station> = {};
    for (const s of stations ?? []) m[s.id] = s;
    return m;
  }, [stations]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("generator_tests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(locale === "ar" ? "تم الحذف" : "Deleted");
      qc.invalidateQueries({ queryKey: ["generator-tests"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            {locale === "ar" ? "اختبار مولد الطوارئ" : "Emergency Generator Test"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {locale === "ar"
              ? "الاختبار الأسبوعي لمولد الديزل الاحتياطي (Emergency Diesel Generator)"
              : "Weekly test run logsheet — Emergency Diesel Generator"}
          </p>
        </div>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-2 text-sm px-4 h-10 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {locale === "ar" ? "اختبار جديد" : "New Test"}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("common.station")}</label>
          <select
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
            className="h-9 rounded-lg border bg-background px-3 text-sm min-w-48"
          >
            <option value="">{locale === "ar" ? "كل المحطات" : "All stations"}</option>
            {(stations ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {locale === "ar" ? s.name_ar : s.name_en}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : (rows ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-xl p-8 text-center">
          {locale === "ar" ? "لا توجد اختبارات بعد" : "No tests yet"}
        </div>
      ) : (
        <div className="border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-start">{t("common.date")}</th>
                <th className="p-3 text-start">{t("common.station")}</th>
                <th className="p-3 text-start">{locale === "ar" ? "المولد" : "Genset"}</th>
                <th className="p-3 text-start">{locale === "ar" ? "المشغّل" : "Operator"}</th>
                <th className="p-3 text-end">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => {
                const st = stationMap[r.station_id];
                return (
                  <tr key={r.id} className="border-t hover:bg-accent/40">
                    <td className="p-3">
                      <button className="text-primary underline-offset-2 hover:underline" onClick={() => onOpen(r.id)}>
                        {r.test_date}
                      </button>
                    </td>
                    <td className="p-3">{st ? `${st.code} — ${locale === "ar" ? st.name_ar : st.name_en}` : "—"}</td>
                    <td className="p-3">{r.genset_tag || "—"}</td>
                    <td className="p-3">{r.operator_name || "—"}</td>
                    <td className="p-3 text-end">
                      {(isAdmin || r.created_by === profile?.id) && (
                        <button
                          onClick={() => {
                            if (confirm(locale === "ar" ? "حذف التقرير؟" : "Delete report?")) del.mutate(r.id);
                          }}
                          className="p-2 rounded hover:bg-destructive/10 text-destructive"
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
    queryKey: ["generator-test", id],
    enabled: !isNew,
    queryFn: async () => {
      const { data, error } = await supabase.from("generator_tests").select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as GeneratorTest;
    },
  });

  const [stationId, setStationId] = useState<string>(profile?.station_id ?? "");
  const [testDate, setTestDate] = useState(todayISO());
  const [gensetTag, setGensetTag] = useState("");
  const [operatorName, setOperatorName] = useState(profile?.full_name ?? "");
  const [supervisorName, setSupervisorName] = useState("");
  const [notes, setNotes] = useState("");
  const [data, setData] = useState<TestData>(emptyData);
  const [hydrated, setHydrated] = useState(false);
  const [excelDownload, setExcelDownload] = useState<DownloadLink | null>(null);
  const [pdfDownload, setPdfDownload] = useState<DownloadLink | null>(null);

  useEffect(() => {
    if (isNew) {
      setStationId(profile?.station_id ?? "");
      setOperatorName((v) => v || profile?.full_name || "");
      setHydrated(true);
      return;
    }
    if (!existing) return;
    setStationId(existing.station_id);
    setTestDate(existing.test_date);
    setGensetTag(existing.genset_tag ?? "");
    setOperatorName(existing.operator_name ?? "");
    setSupervisorName(existing.supervisor_name ?? "");
    setNotes(existing.supervisor_notes ?? "");
    const raw = (existing.data ?? {}) as Partial<TestData>;
    setData({ values: { ...(raw.values ?? {}) }, remarks: raw.remarks ?? "" });
    setHydrated(true);
  }, [isNew, existing, profile?.station_id, profile?.full_name]);

  useEffect(() => {
    return () => {
      if (excelDownload) URL.revokeObjectURL(excelDownload.url);
      if (pdfDownload) URL.revokeObjectURL(pdfDownload.url);
    };
  }, [excelDownload, pdfDownload]);

  const stationMap = useMemo(() => {
    const m: Record<string, Station> = {};
    for (const s of stations ?? []) m[s.id] = s;
    return m;
  }, [stations]);
  const station = stationMap[stationId];

  const setValue = (key: string, v: string) =>
    setData((d) => ({ ...d, values: { ...d.values, [key]: v } }));

  const save = useMutation({
    mutationFn: async () => {
      if (!stationId) throw new Error(locale === "ar" ? "اختر المحطة" : "Pick a station");
      const payload = {
        station_id: stationId,
        test_date: testDate,
        genset_tag: gensetTag || null,
        data: JSON.parse(JSON.stringify(data)),
        supervisor_notes: notes || null,
        supervisor_name: supervisorName || null,
        operator_name: operatorName || null,
      };
      if (isNew) {
        const { data: ins, error } = await supabase
          .from("generator_tests")
          .insert({ ...payload, operator_id: profile?.id ?? null, created_by: profile?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        return ins.id as string;
      }
      const { error } = await supabase.from("generator_tests").update(payload).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (newId) => {
      toast.success(locale === "ar" ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["generator-tests"] });
      qc.invalidateQueries({ queryKey: ["generator-test", newId] });
      if (isNew) window.history.replaceState({}, "", `?id=${newId}`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent">
          <Back className="h-4 w-4" /> {locale === "ar" ? "رجوع" : "Back"}
        </button>
        <div className="flex-1" />
        <button
          onClick={async () => {
            try {
              const file = await buildElementPdf({
                elementId: "generator-print-sheet",
                filename: `Emergency_Generator_Test_${safeFilePart(station?.code)}_${testDate}.pdf`,
              });
              const link = await triggerBlobDownload(file.blob, file.filename);
              setPdfDownload((p) => {
                if (p) URL.revokeObjectURL(p.url);
                return link;
              });
              toast.success(locale === "ar" ? "تم تجهيز ملف PDF" : "PDF ready");
            } catch (err) {
              toast.error((locale === "ar" ? "تعذر تصدير PDF: " : "PDF export failed: ") + ((err as Error)?.message || String(err)));
            }
          }}
          className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent"
        >
          <Printer className="h-4 w-4" />
          {locale === "ar" ? "تصدير PDF" : "Export PDF"}
        </button>
        {pdfDownload && (
          <a href={pdfDownload.url} download={pdfDownload.filename} className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border border-primary text-primary">
            <Printer className="h-4 w-4" /> {locale === "ar" ? "تحميل PDF" : "Download PDF"}
          </a>
        )}
        <button
          onClick={async () => {
            try {
              const file = await exportGeneratorXlsx({
                station: station ?? null,
                testDate,
                gensetTag,
                operatorName,
                supervisorName,
                notes,
                data,
              });
              const link = await triggerBlobDownload(file.blob, file.filename);
              setExcelDownload((p) => {
                if (p) URL.revokeObjectURL(p.url);
                return link;
              });
              toast.success(locale === "ar" ? "تم تجهيز ملف Excel" : "Excel ready");
            } catch (err) {
              toast.error((locale === "ar" ? "تعذر تصدير Excel: " : "Excel export failed: ") + ((err as Error)?.message || String(err)));
            }
          }}
          className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent"
        >
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          {locale === "ar" ? "تصدير Excel" : "Export Excel"}
        </button>
        {excelDownload && (
          <a href={excelDownload.url} download={excelDownload.filename} className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border border-primary text-primary">
            <FileSpreadsheet className="h-4 w-4" /> {locale === "ar" ? "تحميل Excel" : "Download Excel"}
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

      <div id="generator-print-sheet" className="bg-card border rounded-xl p-5 md:p-8 space-y-6" dir="ltr">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div>
            <div className="text-xs font-semibold tracking-wide text-muted-foreground print:text-black">
              WEEKLY TEST RUN LOGSHEET
            </div>
            <h2 className="text-lg md:text-xl font-bold mt-1">EMERGENCY DIESEL GENERATOR</h2>
            <div className="text-xs mt-1">
              SYSTEM: <span className="font-semibold">EMERGENCY POWER — DIESEL GENSET</span>
            </div>
          </div>
          <div className="text-xs text-end leading-5">
            WTCO
            <br />
            O&amp;M Eastern Province
            <br />
            Pipeline Administration JUBAIL
            <br />
            REV – 0
          </div>
        </div>

        {/* Meta */}
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Station">
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
            >
              <option value="">—</option>
              {(stations ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name_en}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
          </Field>
          <Field label="Genset / Tag">
            <input value={gensetTag} onChange={(e) => setGensetTag(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
          </Field>
          <Field label="Operator">
            <input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
          </Field>
        </div>

        {/* Sections */}
        {SECTIONS.map((sec) => (
          <div key={sec.key} className="border rounded-lg overflow-hidden">
            <div className="bg-muted/60 px-4 py-2 border-b">
              <div className="font-bold text-sm">{sec.title}</div>
              <div className="text-xs text-muted-foreground print:text-black">
                {locale === "ar" ? sec.hintAr : sec.hint}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-2 text-start w-56">COMPONENT</th>
                  <th className="p-2 text-start">ITEM</th>
                  <th className="p-2 text-start w-64">READING / STATUS</th>
                </tr>
              </thead>
              <tbody>
                {sec.fields.map((f, i) => {
                  const prev = sec.fields[i - 1];
                  const showGroup = f.group && (!prev || prev.group !== f.group);
                  return (
                    <tr key={f.key} className="border-t">
                      <td className="p-2 font-semibold align-middle">{showGroup ? f.group : ""}</td>
                      <td className="p-2">{f.label}</td>
                      <td className="p-2">
                        {f.kind === "text" ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={data.values[f.key] ?? ""}
                              onChange={(e) => setValue(f.key, e.target.value)}
                              className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                            />
                            <span className="text-xs text-muted-foreground print:text-black whitespace-nowrap">{f.unit}</span>
                          </div>
                        ) : (
                          <select
                            value={data.values[f.key] ?? ""}
                            onChange={(e) => setValue(f.key, e.target.value)}
                            className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
                          >
                            <option value="">—</option>
                            {OPTIONS[f.kind].map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {/* Remarks */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/60 px-4 py-2 border-b font-bold text-sm">REMARKS</div>
          <div className="p-3">
            <textarea
              value={data.remarks}
              onChange={(e) => setData((d) => ({ ...d, remarks: e.target.value }))}
              rows={3}
              placeholder="e.g. Emergency genset out of service due to battery circuit faulty"
              className="w-full rounded-lg border bg-background p-3 text-sm"
            />
          </div>
        </div>

        {/* Notes & signature */}
        <div className="space-y-3">
          <div>
            <div className="text-sm font-bold mb-1">SUPERVISOR NOTES</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-lg border bg-background p-3 text-sm"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3 pt-2 border-t">
            <Field label="Supervisor Name">
              <input value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" />
            </Field>
            <Field label="Station">
              <div className="h-9 flex items-center text-sm">{station ? `${station.code} — ${station.name_en}` : "—"}</div>
            </Field>
            <Field label="Date">
              <div className="h-9 flex items-center text-sm">{testDate}</div>
            </Field>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          aside, header, nav, .print\\:hidden { display: none !important; }
          main { padding: 0 !important; }
          #generator-print-sheet { color: black !important; border: none !important; }
          #generator-print-sheet input, #generator-print-sheet select, #generator-print-sheet textarea {
            border: none !important; background: transparent !important; color: black !important;
            -webkit-appearance: none; appearance: none;
          }
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground print:text-black block mb-1">{label}</label>
      {children}
    </div>
  );
}

/* ============================ EXCEL EXPORT ============================ */

async function exportGeneratorXlsx(opts: {
  station: Station | null;
  testDate: string;
  gensetTag: string;
  operatorName: string;
  supervisorName: string;
  notes: string;
  data: TestData;
}) {
  const { station, testDate, gensetTag, operatorName, supervisorName, notes, data } = opts;
  const ExcelJS = (await import("exceljs")) as any;
  const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook;
  if (!Workbook) throw new Error("Excel engine not loaded");
  const wb = new Workbook();
  wb.creator = "WTCO";
  wb.created = new Date();
  const ws = wb.addWorksheet("Emergency Generator", {
    pageSetup: { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [{ width: 30 }, { width: 34 }, { width: 24 }, { width: 20 }];

  const border = () => ({
    top: { style: "thin", color: { argb: "FF9E9E9E" } },
    bottom: { style: "thin", color: { argb: "FF9E9E9E" } },
    left: { style: "thin", color: { argb: "FF9E9E9E" } },
    right: { style: "thin", color: { argb: "FF9E9E9E" } },
  });

  let r = 1;
  ws.mergeCells(`A${r}:D${r}`);
  ws.getCell(`A${r}`).value = "EMERGENCY DIESEL GENERATOR — WEEKLY TEST RUN LOGSHEET";
  ws.getCell(`A${r}`).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  ws.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC00000" } };
  ws.getCell(`A${r}`).alignment = { horizontal: "center" };
  ws.getRow(r).height = 24;
  r += 2;

  const meta: [string, string][] = [
    ["Station", station ? `${station.code} - ${station.name_en}` : ""],
    ["Date", testDate],
    ["Genset / Tag", gensetTag],
    ["Operator", operatorName],
  ];
  for (const [k, v] of meta) {
    const row = ws.getRow(r++);
    row.getCell(1).value = k;
    row.getCell(1).font = { bold: true, color: { argb: "FF1F4E78" } };
    row.getCell(2).value = v;
    [1, 2].forEach((c) => (row.getCell(c).border = border() as any));
  }
  r += 1;

  for (const sec of SECTIONS) {
    ws.mergeCells(`A${r}:D${r}`);
    const head = ws.getCell(`A${r}`);
    head.value = sec.title;
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    r++;
    const hr = ws.getRow(r++);
    hr.values = ["COMPONENT", "ITEM", "READING / STATUS", "UNIT"];
    hr.font = { bold: true };
    hr.eachCell((c: any) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
      c.border = border();
    });
    for (const f of sec.fields) {
      const row = ws.getRow(r++);
      row.values = [f.group ?? "", f.label, data.values[f.key] ?? "", f.unit ?? ""];
      row.eachCell({ includeEmpty: true }, (c: any) => {
        c.border = border();
        c.alignment = { vertical: "middle", wrapText: true };
      });
    }
    r += 1;
  }

  ws.getCell(`A${r}`).value = "REMARKS";
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: "FF1F4E78" } };
  r++;
  ws.mergeCells(`A${r}:D${r}`);
  ws.getCell(`A${r}`).value = data.remarks || "—";
  ws.getCell(`A${r}`).alignment = { vertical: "top", wrapText: true };
  ws.getRow(r).height = 45;
  r += 2;

  ws.getCell(`A${r}`).value = "SUPERVISOR NOTES";
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: "FF1F4E78" } };
  r++;
  ws.mergeCells(`A${r}:D${r}`);
  ws.getCell(`A${r}`).value = notes || "—";
  ws.getCell(`A${r}`).alignment = { vertical: "top", wrapText: true };
  ws.getRow(r).height = 60;
  r += 2;

  const sig = ws.getRow(r);
  sig.values = [
    `Supervisor Name: ${supervisorName || ""}`,
    "Signature:",
    `Station: ${station?.code ?? ""}`,
    `Date: ${testDate}`,
  ];
  sig.font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  return {
    blob: createExcelBlob(buffer),
    filename: `Emergency_Generator_Test_${safeFilePart(station?.code)}_${testDate}.xlsx`,
  };
}
