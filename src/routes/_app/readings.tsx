import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Save, ClipboardList, CheckCircle2, Circle } from "lucide-react";
import { z } from "zod";

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

function ReadingsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/readings" });
  const { profile, isAdmin, hasRole } = useAuth();
  const canPickStation = isAdmin || hasRole("supervisor") || hasRole("viewer");

  const date = search.date ?? todayISO();
  const stationId = search.station ?? profile?.station_id ?? undefined;
  const templateId = search.template;

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({ search: (prev) => ({ ...prev, ...patch }) as never, replace: false });
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
    enabled: canPickStation,
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reading_templates")
        .select("id, code, name_en, name_ar, frequency, time_slots, active")
        .eq("active", true)
        .order("code");
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
          .select("id, notes, operator_name, reading_values(id, field_id, time_slot, value)")
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
          | { id: string; notes: string | null; operator_name: string | null; reading_values: { id: string; field_id: string; time_slot: string; value: number }[] }
          | null,
      };
    },
  });

  // key = `${fieldId}|${slot}` -> string value
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!data) return;
    const v: Record<string, string> = {};
    for (const rv of data.entry?.reading_values ?? []) {
      v[`${rv.field_id}|${rv.time_slot}`] = rv.value != null ? String(rv.value) : "";
    }
    setValues(v);
    setNotes(data.entry?.notes ?? "");
    setOperatorName(data.entry?.operator_name ?? profile?.full_name ?? "");
    setHydrated(true);
  }, [data, profile?.full_name]);

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
            operator_name: operatorName || profile?.full_name,
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
            operator_name: operatorName || profile?.full_name,
            notes: notes || null,
          })
          .eq("id", entryId);
        if (error) throw error;
      }

      // 2) build value rows (only for cells with content)
      const existing = new Map<string, string>(
        (data?.entry?.reading_values ?? []).map((rv) => [`${rv.field_id}|${rv.time_slot}`, rv.id]),
      );
      const toUpsert: { entry_id: string; field_id: string; time_slot: string; value: number }[] = [];
      const toDelete: string[] = [];

      for (const [key, raw] of Object.entries(values)) {
        const [field_id, time_slot] = key.split("|");
        const trimmed = raw.trim();
        if (trimmed === "") {
          const id = existing.get(key);
          if (id) toDelete.push(id);
          continue;
        }
        const num = Number(trimmed);
        if (Number.isNaN(num)) throw new Error(`Invalid number for ${key}`);
        toUpsert.push({ entry_id: entryId!, field_id, time_slot, value: num });
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
        <button
          onClick={() => save.mutate()}
          disabled={!canWrite || save.isPending}
          className="inline-flex items-center gap-2 text-sm px-4 h-9 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-90"
        >
          <Save className="h-4 w-4" />
          {save.isPending ? (locale === "ar" ? "جارٍ الحفظ…" : "Saving…") : t("common.save")}
        </button>
      </div>

      {!canWrite && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
          {locale === "ar" ? "وضع القراءة فقط" : "Read-only mode"}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {locale === "ar" ? "اسم المشغل" : "Operator name"}
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
            {locale === "ar" ? "ملاحظات" : "Notes"}
          </label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canWrite}
            className="h-10 px-3 rounded-lg border bg-background text-sm"
          />
        </div>
      </div>

      {sections.map((sec) => {
        const fs = fieldsBySection[sec.id] ?? [];
        if (fs.length === 0) return null;
        return (
          <div key={sec.id} className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-muted/40">
              <h2 className="text-sm font-semibold">
                {locale === "ar" ? sec.name_ar : sec.name_en}
              </h2>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm" dir={dir}>
                <thead className="bg-muted/20">
                  <tr>
                    <th className="text-start px-3 py-2 font-medium sticky start-0 bg-muted/40 z-10 min-w-[160px]">
                      {locale === "ar" ? "الحقل" : "Field"}
                    </th>
                    {template.time_slots.map((slot) => (
                      <th key={slot} className="px-2 py-2 font-medium text-center min-w-[80px]" dir="ltr">
                        {slot}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fs.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="px-3 py-1.5 sticky start-0 bg-card z-10 border-e">
                        <div className="font-medium truncate">
                          {locale === "ar" ? f.label_ar : f.label_en}
                        </div>
                        {f.unit && (
                          <div className="text-xs text-muted-foreground" dir="ltr">
                            {f.unit}
                          </div>
                        )}
                      </td>
                      {template.time_slots.map((slot) => {
                        const key = `${f.id}|${slot}`;
                        return (
                          <td key={slot} className="p-1">
                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              value={values[key] ?? ""}
                              onChange={(e) =>
                                setValues((v) => ({ ...v, [key]: e.target.value }))
                              }
                              disabled={!canWrite}
                              className="w-full h-9 px-2 rounded-md border bg-background text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                              dir="ltr"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
