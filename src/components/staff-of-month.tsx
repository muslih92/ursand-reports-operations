import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Award, ChevronDown, ChevronUp, Medal, ShieldCheck, Star } from "lucide-react";
import { useState } from "react";

type Row = {
  user_id: string;
  full_name: string;
  employee_no: string;
  role: "operator" | "supervisor";
  station_code: string | null;
  m1: number;
  m2: number;
  m3: number;
  m4: number;
  total_score: number;
  rank: number;
  month_start: string;
  month_end: string;
};

const METRICS = {
  operator: [
    { k: "m1", ar: "انتظام القراءات", en: "Readings days" },
    { k: "m2", ar: "تقارير الورديات", en: "Shift reports" },
    { k: "m3", ar: "الالتزام بالوقت", en: "Punctuality" },
    { k: "m4", ar: "اكتمال الإدخال", en: "Completeness" },
  ],
  supervisor: [
    { k: "m1", ar: "متابعة التواجدية", en: "Availability" },
    { k: "m2", ar: "الجولات اليومية", en: "Routines" },
    { k: "m3", ar: "إغلاق الحوادث", en: "Incidents closed" },
    { k: "m4", ar: "سرعة الرد", en: "Responsiveness" },
  ],
} as const;

function Card({ rows, kind }: { rows: Row[]; kind: "operator" | "supervisor" }) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  const winner = rows[0];
  const rest = rows.slice(1, 6);
  const isOp = kind === "operator";
  const Icon = isOp ? Star : ShieldCheck;

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 ring-2 ring-primary/50">
          <Icon className="h-7 w-7 text-primary" />
        </div>
        <div className="min-w-[180px] flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Award className="h-4 w-4" />
            {isOp
              ? ar ? "الموظف المتميز لهذا الشهر" : "Employee of the Month"
              : ar ? "المشرف المتميز لهذا الشهر" : "Supervisor of the Month"}
          </div>
          <div className="text-xl font-bold">{winner.full_name}</div>
          <div className="text-xs text-muted-foreground">
            {winner.employee_no}
            {winner.station_code ? ` · ${winner.station_code}` : ""} · {winner.month_start} → {winner.month_end}
          </div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-extrabold text-primary">{winner.total_score}</div>
          <div className="text-[11px] text-muted-foreground">{ar ? "النقاط من 100" : "Score / 100"}</div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-sm text-primary hover:underline"
        >
          {ar ? "الترتيب" : "Ranking"}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {METRICS[kind].map((m) => (
          <div key={m.k} className="rounded-lg border bg-background/70 px-2 py-1.5">
            <div className="truncate text-[11px] text-muted-foreground">{ar ? m.ar : m.en}</div>
            <div className="text-sm font-semibold">{(winner as any)[m.k]}%</div>
          </div>
        ))}
      </div>

      {open && rest.length > 0 && (
        <ul className="mt-3 divide-y rounded-lg border bg-background/60">
          {rest.map((r) => (
            <li key={r.user_id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-6 text-center font-semibold text-muted-foreground">{r.rank}</span>
              <Medal
                className={`h-4 w-4 ${
                  r.rank === 2 ? "text-slate-400" : r.rank === 3 ? "text-amber-700" : "text-muted-foreground/40"
                }`}
              />
              <span className="flex-1 truncate">
                {r.full_name}
                {r.station_code ? ` · ${r.station_code}` : ""}
              </span>
              <span className="font-semibold">{r.total_score}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StaffOfMonth() {
  const { data, isLoading } = useQuery({
    queryKey: ["staff-of-month"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("staff_month_scores" as any, {} as any);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data || data.length === 0) return null;

  const operators = data.filter((r) => r.role === "operator");
  const supervisors = data.filter((r) => r.role === "supervisor");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card rows={operators} kind="operator" />
      <Card rows={supervisors} kind="supervisor" />
    </div>
  );
}
