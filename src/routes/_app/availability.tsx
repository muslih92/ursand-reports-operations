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
  Trash2,
  Settings2,
  Activity,
  Pencil,
  FileSpreadsheet,
} from "lucide-react";
import { z } from "zod";
import { saveAs } from "file-saver";
// ExcelJS, jsPDF and html2canvas are imported dynamically inside the export functions.

const searchSchema = z.object({
  id: z.string().optional(),
  manage: z.string().optional(),
});

export const Route = createFileRoute("/_app/availability")({
  validateSearch: searchSchema,
  component: AvailabilityPage,
});

type EqStatus = "in_service" | "standby" | "out_of_service" | "fixed_speed";

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

const STATUS_LIST: EqStatus[] = ["in_service", "standby", "out_of_service", "fixed_speed"];

function statusLabel(s: EqStatus, locale: "ar" | "en") {
  const map: Record<EqStatus, { ar: string; en: string }> = {
    in_service: { ar: "في الخدمة", en: "In Service" },
    standby: { ar: "احتياطي", en: "Standby" },
    out_of_service: { ar: "خارج الخدمة", en: "Out of Service" },
    fixed_speed: { ar: "سرعة ثابتة", en: "Fixed Speed" },
  };
  return map[s][locale];
}

function statusColor(s: EqStatus): string {
  switch (s) {
    case "in_service":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    case "standby":
      return "bg-sky-500/15 text-sky-700 border-sky-500/30";
    case "out_of_service":
      return "bg-red-500/15 text-red-700 border-red-500/30";
    case "fixed_speed":
      return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  }
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
            {locale === "ar" ? "تواجدية المعدات اليومية" : "Daily Equipment Availability"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar"
              ? "حالة الوحدات: في الخدمة / احتياطي / خارج الخدمة / سرعة ثابتة"
              : "Unit status: in service / standby / out of service / fixed speed"}
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
            {locale === "ar" ? "تقرير جديد" : "New Report"}
          </button>
        </div>
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
  const [notes, setNotes] = useState<string>("");
  const [values, setValues] = useState<Record<string, ValueDraft>>({});
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
    fixed_speed: 0,
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
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent"
        >
          <Printer className="h-4 w-4" />
          {locale === "ar" ? "طباعة / PDF" : "Print / PDF"}
        </button>
        <button
          onClick={async () => {
            try {
              await exportAvailabilityXlsx({
                locale,
                station: station ?? null,
                entryDate,
                operatorName,
                notes,
                equipment: equipment ?? [],
                values,
              });
            } catch (err) {
              console.error("Excel export failed", err);
              toast.error(
                locale === "ar"
                  ? "تعذر تصدير Excel: " + (err as Error).message
                  : "Excel export failed: " + (err as Error).message,
              );
            }
          }}
          disabled={!stationId}
          className="inline-flex items-center gap-2 text-sm px-3 h-9 rounded-lg border hover:bg-accent disabled:opacity-50"
        >
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          {locale === "ar" ? "تصدير Excel" : "Export Excel"}
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
            {locale === "ar" ? "بواسطة" : "Reported by"}
          </label>
          <input
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            disabled={!canWrite}
            className="h-10 px-3 rounded-lg border bg-background text-sm"
          />
        </div>
      </div>

      {/* Printable sheet */}
      <div
        id="print-sheet"
        className="rounded-xl border bg-card p-6 md:p-8 print:border-0 print:shadow-none print:rounded-none print:p-0"
      >
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold">
            {locale === "ar" ? "تقرير تواجدية المعدات اليومي" : "Daily Equipment Availability Report"}
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
                {(equipment ?? []).map((e) => {
                  const v = values[e.id] ?? emptyDraft();
                  const update = (patch: Partial<ValueDraft>) =>
                    setValues((prev) => ({ ...prev, [e.id]: { ...v, ...patch } }));
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
                            onChange={(ev) => update({ status: ev.target.value as EqStatus })}
                            disabled={!canWrite}
                            className={`h-9 px-2 rounded-md border text-sm w-full ${statusColor(v.status)}`}
                          >
                            {STATUS_LIST.map((s) => (
                              <option key={s} value={s}>
                                {statusLabel(s, locale)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <span
                          className={`hidden print:inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${statusColor(v.status)}`}
                        >
                          {statusLabel(v.status, locale)}
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
    case "in_service":
      return "IN SERVICE";
    case "standby":
      return "ON STANDBY";
    case "out_of_service":
      return "OUT OF SERVICE";
    case "fixed_speed":
      return "STANDBY ON FIXED SPEED";
  }
}

function xlsxStatusFill(s: EqStatus): string {
  switch (s) {
    case "in_service":
      return "FFC6EFCE";
    case "standby":
      return "FFBDD7EE";
    case "out_of_service":
      return "FFFFC7CE";
    case "fixed_speed":
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
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
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
    { label: "STANDBY ON FIXED SPEED", s: "fixed_speed" },
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
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const fname = `Daily_Availability_${station?.code || "Report"}_${entryDate}.xlsx`;
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
