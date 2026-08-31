import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useScopedStations, useStationScope } from "@/lib/station-scope";
import { toast } from "sonner";
import { ClipboardCheck, Printer, Save, Plus, ArrowLeft, ListChecks } from "lucide-react";

export const Route = createFileRoute("/_app/routine")({
  head: () => ({
    meta: [
      { title: "Supervisor's Routine | WTCO" },
      {
        name: "description",
        content:
          "Daily supervisor routine checklist from Sunday to Thursday with done / not done status and reasons.",
      },
      { property: "og:title", content: "Supervisor's Routine" },
      {
        property: "og:description",
        content: "Record the daily supervisor routine tasks, their status and reasons for pending items.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoutinePage,
});

/* ======================= TASK LIST PER WEEKDAY ======================= */

interface TaskDef {
  key: string;
  en: string;
  ar: string;
}

interface DayDef {
  weekday: number; // JS getDay(): 0=Sunday .. 4=Thursday
  en: string;
  ar: string;
  tasks: TaskDef[];
}

const DAYS: DayDef[] = [
  {
    weekday: 0,
    en: "Sunday",
    ar: "الأحد",
    tasks: [
      { key: "sun_1", en: "Review previous shift reports and pending remarks", ar: "مراجعة تقارير الورديات السابقة والملاحظات المعلّقة" },
      { key: "sun_2", en: "Field round on main pumps and motors", ar: "جولة ميدانية على المضخات الرئيسية والمحركات" },
      { key: "sun_3", en: "Verify daily readings entered on time", ar: "التأكد من إدخال القراءات اليومية في وقتها" },
      { key: "sun_4", en: "Check equipment availability (MDR) status", ar: "مراجعة حالة تواجدية المعدات (MDR)" },
      { key: "sun_5", en: "Follow up open work notifications", ar: "متابعة بلاغات الأعمال المفتوحة" },
    ],
  },
  {
    weekday: 1,
    en: "Monday",
    ar: "الاثنين",
    tasks: [
      { key: "mon_1", en: "Inspect cooling system and circulation pumps", ar: "فحص نظام التبريد ومضخات الدوران" },
      { key: "mon_2", en: "Check lube oil levels and leakages", ar: "فحص مستويات زيت التزييت والتسريبات" },
      { key: "mon_3", en: "Review vibration and temperature trends", ar: "مراجعة قراءات الاهتزاز ودرجات الحرارة" },
      { key: "mon_4", en: "Verify housekeeping and site cleanliness", ar: "التأكد من نظافة وترتيب الموقع" },
      { key: "mon_5", en: "Toolbox talk with operators", ar: "اجتماع سلامة قصير مع المشغلين" },
    ],
  },
  {
    weekday: 2,
    en: "Tuesday",
    ar: "الثلاثاء",
    tasks: [
      { key: "tue_1", en: "Fire fighting system and fire pumps check", ar: "فحص نظام مكافحة الحريق ومضخات الحريق" },
      { key: "tue_2", en: "Emergency diesel generator visual check", ar: "الفحص الظاهري لمولد الديزل الاحتياطي" },
      { key: "tue_3", en: "Check emergency lighting and exits", ar: "فحص إنارة الطوارئ ومخارج الطوارئ" },
      { key: "tue_4", en: "Verify safety equipment and PPE availability", ar: "التأكد من توفر معدات السلامة والوقاية الشخصية" },
      { key: "tue_5", en: "Review incident reports of the week", ar: "مراجعة تقارير الحوادث خلال الأسبوع" },
    ],
  },
  {
    weekday: 3,
    en: "Wednesday",
    ar: "الأربعاء",
    tasks: [
      { key: "wed_1", en: "Inspect surge vessels and air compressors", ar: "فحص أوعية الصدمة وضواغط الهواء" },
      { key: "wed_2", en: "Check valves positions and actuators", ar: "فحص أوضاع الصمامات والمشغّلات" },
      { key: "wed_3", en: "Verify booster pumps operation", ar: "التحقق من تشغيل مضخات التعزيز" },
      { key: "wed_4", en: "Review electrical panels and alarms", ar: "مراجعة اللوحات الكهربائية والإنذارات" },
      { key: "wed_5", en: "Coordinate with maintenance on pending jobs", ar: "التنسيق مع الصيانة بخصوص الأعمال المعلقة" },
    ],
  },
  {
    weekday: 4,
    en: "Thursday",
    ar: "الخميس",
    tasks: [
      { key: "thu_1", en: "Weekly summary of station performance", ar: "ملخص أسبوعي لأداء المحطة" },
      { key: "thu_2", en: "Verify spare parts and consumables stock", ar: "التأكد من مخزون قطع الغيار والمستهلكات" },
      { key: "thu_3", en: "Check standby units readiness", ar: "التأكد من جاهزية الوحدات الاحتياطية" },
      { key: "thu_4", en: "Update manpower and shift schedule", ar: "تحديث جدول القوى العاملة والورديات" },
      { key: "thu_5", en: "Submit weekly report to management", ar: "رفع التقرير الأسبوعي للإدارة" },
    ],
  },
];

type Status = "done" | "not_done" | "";

interface ItemState {
  key: string;
  label: string;
  status: Status;
  reason: string;
}

interface RoutineRow {
  id: string;
  station_id: string;
  routine_date: string;
  weekday: number;
  supervisor_name: string | null;
  items: ItemState[];
  notes: string | null;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00`).getDay();

function RoutinePage() {
  const { locale, dir } = useI18n();
  const ar = locale === "ar";
  const { profile, user } = useAuth();
  const qc = useQueryClient();
  const { scopedStationId, canPickStation } = useStationScope();
  const { data: stations } = useScopedStations();

  const [date, setDate] = useState(todayISO());
  const [stationId, setStationId] = useState<string>("");
  const [items, setItems] = useState<ItemState[]>([]);
  const [notes, setNotes] = useState("");
  const [view, setView] = useState<"list" | "form">("list");

  const { data: records, isFetching: listLoading } = useQuery({
    queryKey: ["supervisor-routine-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supervisor_routines")
        .select("id, station_id, routine_date, weekday, supervisor_name, items, notes, stations(code, name_en, name_ar)")
        .order("routine_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as (RoutineRow & {
        stations: { code: string; name_en: string; name_ar: string } | null;
      })[];
    },
  });

  useEffect(() => {
    if (scopedStationId) setStationId(scopedStationId);
    else if (!stationId && stations && stations.length > 0) setStationId(stations[0]!.id);
  }, [scopedStationId, stations]);

  const weekday = weekdayOf(date);
  const day = useMemo(() => DAYS.find((d) => d.weekday === weekday) ?? null, [weekday]);
  const station = stations?.find((s) => s.id === stationId);

  const { data: existing, isFetching } = useQuery({
    queryKey: ["supervisor-routine", stationId, date],
    enabled: !!stationId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supervisor_routines")
        .select("id, station_id, routine_date, weekday, supervisor_name, items, notes")
        .eq("station_id", stationId)
        .eq("routine_date", date)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as RoutineRow | null) ?? null;
    },
  });

  useEffect(() => {
    if (!day) {
      setItems([]);
      setNotes("");
      return;
    }
    const saved = (existing?.items ?? []) as ItemState[];
    setItems(
      day.tasks.map((t) => {
        const prev = saved.find((s) => s.key === t.key);
        return {
          key: t.key,
          label: ar ? t.ar : t.en,
          status: (prev?.status as Status) ?? "",
          reason: prev?.reason ?? "",
        };
      }),
    );
    setNotes(existing?.notes ?? "");
  }, [existing, day, ar]);

  const setStatus = (key: string, status: Status) =>
    setItems((prev) =>
      prev.map((i) =>
        i.key === key ? { ...i, status, reason: status === "not_done" ? i.reason : "" } : i,
      ),
    );
  const setReason = (key: string, reason: string) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, reason } : i)));

  const save = useMutation({
    mutationFn: async () => {
      if (!stationId) throw new Error(ar ? "اختر المحطة" : "Select a station");
      if (!day) throw new Error(ar ? "لا توجد مهام في هذا اليوم" : "No tasks for this day");
      const missing = items.find((i) => i.status === "not_done" && !i.reason.trim());
      if (missing) throw new Error(ar ? "اكتب سبب عدم التنفيذ لكل مهمة غير منفذة" : "Enter a reason for every NOT DONE task");
      const payload = {
        station_id: stationId,
        routine_date: date,
        weekday,
        supervisor_id: user?.id ?? null,
        supervisor_name: profile?.full_name ?? null,
        items: items as unknown as never,
        notes: notes || null,
        created_by: user?.id ?? null,
      };
      if (existing?.id) {
        const { error } = await supabase.from("supervisor_routines").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("supervisor_routines").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(ar ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["supervisor-routine", stationId, date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <div dir={dir} className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <ClipboardCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold flex-1">
          {ar ? "روتين المشرف اليومي" : "Supervisor's Routine"}
        </h1>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border px-3 h-9 text-sm hover:bg-accent"
        >
          <Printer className="h-4 w-4" />
          {ar ? "طباعة" : "Print"}
        </button>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !day}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 h-9 text-sm disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {ar ? "حفظ" : "Save"}
        </button>
      </div>

      <div className="rounded-xl border bg-card p-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">{ar ? "التاريخ" : "Date"}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-full rounded-lg border bg-background px-2 text-sm"
          />
        </label>
        <label className="text-sm space-y-1">
          <span className="text-muted-foreground">{ar ? "المحطة" : "Station"}</span>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            disabled={!canPickStation}
            className="h-9 w-full rounded-lg border bg-background px-2 text-sm disabled:opacity-70"
          >
            <option value="">—</option>
            {(stations ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {ar ? s.name_ar : s.name_en}
              </option>
            ))}
          </select>
        </label>
        <div className="text-sm space-y-1">
          <span className="text-muted-foreground">{ar ? "اليوم" : "Day"}</span>
          <div className="h-9 flex items-center rounded-lg border bg-muted/40 px-2 font-semibold">
            {day ? (ar ? day.ar : day.en) : ar ? "عطلة (لا توجد مهام)" : "Weekend (no tasks)"}
          </div>
        </div>
      </div>

      <div className="hidden print:block text-center space-y-1 mb-3">
        <img src="/wtco-logo.png" alt="WTCO" className="h-12 mx-auto object-contain" />
        <div className="text-lg font-bold uppercase">Supervisor&apos;s Routine</div>
        <div className="text-sm">
          {station ? station.code : ""} — {date} — {day ? day.en : ""}
        </div>
      </div>

      {day ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="p-3 w-10 text-start">#</th>
                <th className="p-3 text-start">{ar ? "المهمة" : "Task"}</th>
                <th className="p-3 w-56 text-center">{ar ? "الحالة" : "Status"}</th>
                <th className="p-3 text-start">{ar ? "سبب عدم التنفيذ" : "Reason if NOT DONE"}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={it.key} className="border-t align-top">
                  <td className="p-3">{idx + 1}</td>
                  <td className="p-3 font-medium">{it.label}</td>
                  <td className="p-2">
                    <div className="flex gap-2 justify-center">
                      {(["done", "not_done"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(it.key, it.status === s ? "" : s)}
                          className={
                            "px-3 h-8 rounded-lg border text-xs font-semibold transition " +
                            (it.status === s
                              ? s === "done"
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "bg-destructive text-destructive-foreground border-destructive"
                              : "hover:bg-accent")
                          }
                        >
                          {s === "done" ? "DONE" : "NOT DONE"}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="p-2">
                    <textarea
                      rows={2}
                      value={it.reason}
                      disabled={it.status !== "not_done"}
                      onChange={(e) => setReason(it.key, e.target.value)}
                      placeholder={it.status === "not_done" ? (ar ? "اكتب السبب" : "Write the reason") : ""}
                      className="w-full rounded-lg border bg-background px-2 py-1 text-sm disabled:bg-muted/40"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 border-t space-y-2">
            <div className="text-xs text-muted-foreground">
              {ar ? "المنفذ" : "Done"}: {doneCount}/{items.length}
              {isFetching ? ` · ${ar ? "جارٍ التحميل..." : "Loading..."}` : ""}
            </div>
            <label className="text-sm space-y-1 block">
              <span className="text-muted-foreground">{ar ? "ملاحظات عامة" : "General notes"}</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border bg-background px-2 py-1 text-sm"
              />
            </label>
            <div className="text-sm">
              {ar ? "المشرف" : "Supervisor"}: <span className="font-semibold">{profile?.full_name}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
          {ar
            ? "لا توجد مهام روتينية في يومي الجمعة والسبت."
            : "No routine tasks on Friday and Saturday."}
        </div>
      )}
    </div>
  );
}
