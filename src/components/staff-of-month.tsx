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
    <div className="rounded-lg border border-primary/30 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/50">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <Award className="h-3 w-3" />
            {isOp
              ? ar ? "الموظف المتميز للشهر" : "Employee of the Month"
              : ar ? "المشرف المتميز للشهر" : "Supervisor of the Month"}
          </div>
          <div className="truncate text-sm font-bold">
            {winner.full_name}
            {winner.station_code ? <span className="text-xs text-muted-foreground"> · {winner.station_code}</span> : null}
          </div>
        </div>
        <div className="text-lg font-extrabold text-primary">{winner.total_score}</div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-primary hover:opacity-80"
          aria-label={ar ? "الترتيب" : "Ranking"}
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {METRICS[kind].map((m) => (
              <div key={m.k} className="rounded-md border bg-background/70 px-1.5 py-1">
                <div className="truncate text-[10px] text-muted-foreground">{ar ? m.ar : m.en}</div>
                <div className="text-xs font-semibold">{(winner as any)[m.k]}%</div>
              </div>
            ))}
          </div>
          {rest.length > 0 && (
            <ul className="mt-2 divide-y rounded-md border bg-background/60">
              {rest.map((r) => (
                <li key={r.user_id} className="flex items-center gap-2 px-2 py-1 text-xs">
                  <span className="w-4 text-center font-semibold text-muted-foreground">{r.rank}</span>
                  <Medal
                    className={`h-3 w-3 ${
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
        </>
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
    <>
      <Card rows={operators} kind="operator" />
      <Card rows={supervisors} kind="supervisor" />
    </>
  );
}
