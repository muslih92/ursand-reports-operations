import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Crown, Medal, Trophy, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

type Row = {
  station_id: string;
  code: string;
  name_en: string;
  name_ar: string;
  availability_score: number;
  readings_score: number;
  systems_score: number;
  reports_score: number;
  punctuality_score: number;
  total_score: number;
  rank: number;
  week_start: string;
  week_end: string;
};

export function StationOfWeek() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["station-of-week"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("station_week_scores" as any, {} as any);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data || data.length === 0) return null;

  const winner = data[0];
  const rest = data.slice(1, 6);
  const label = (r: Row) => (ar ? r.name_ar : r.name_en) || r.code;

  const metrics = [
    { k: "availability_score", ar: "تواجدية الوحدات", en: "Availability" },
    { k: "readings_score", ar: "القراءات", en: "Readings" },
    { k: "systems_score", ar: "تغطية الأنظمة", en: "Systems" },
    { k: "reports_score", ar: "التقارير", en: "Reports" },
    { k: "punctuality_score", ar: "الانتظام بالوقت", en: "Punctuality" },
  ] as const;

  return (
    <div className="rounded-xl border border-amber-400/50 bg-gradient-to-l from-amber-500/10 via-amber-400/5 to-transparent p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-400/20 ring-2 ring-amber-400">
          <Crown className="h-7 w-7 text-amber-500" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
            <Trophy className="h-4 w-4" />
            {ar ? "المحطة المثالية لهذا الأسبوع" : "Station of the Week"}
          </div>
          <div className="text-xl font-bold">
            {label(winner)} <span className="text-muted-foreground text-sm">· {winner.code}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {winner.week_start} → {winner.week_end}
          </div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-extrabold text-amber-600">{winner.total_score}</div>
          <div className="text-[11px] text-muted-foreground">{ar ? "النقاط من 100" : "Score / 100"}</div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-sm text-amber-700 hover:underline flex items-center gap-1"
        >
          {ar ? "الترتيب" : "Ranking"}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {metrics.map((m) => (
          <div key={m.k} className="rounded-lg bg-background/70 border px-2 py-1.5">
            <div className="text-[11px] text-muted-foreground truncate">{ar ? m.ar : m.en}</div>
            <div className="text-sm font-semibold">{(winner as any)[m.k]}%</div>
          </div>
        ))}
      </div>

      {open && rest.length > 0 && (
        <ul className="mt-3 divide-y rounded-lg border bg-background/60">
          {rest.map((r) => (
            <li key={r.station_id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-6 text-center font-semibold text-muted-foreground">{r.rank}</span>
              <Medal className={`h-4 w-4 ${r.rank === 2 ? "text-slate-400" : r.rank === 3 ? "text-amber-700" : "text-muted-foreground/40"}`} />
              <span className="flex-1 truncate">{label(r)} · {r.code}</span>
              <span className="font-semibold">{r.total_score}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
