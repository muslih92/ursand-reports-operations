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
    <div className="rounded-lg border border-amber-400/50 bg-gradient-to-l from-amber-500/10 via-amber-400/5 to-transparent px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/20 ring-1 ring-amber-400">
          <Crown className="h-4 w-4 text-amber-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
            <Trophy className="h-3 w-3" />
            {ar ? "المحطة المثالية للأسبوع" : "Station of the Week"}
          </div>
          <div className="truncate text-sm font-bold">
            {label(winner)} <span className="text-xs text-muted-foreground">· {winner.code}</span>
          </div>
        </div>
        <div className="text-lg font-extrabold text-amber-600">{winner.total_score}</div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-amber-700 hover:text-amber-800"
          aria-label={ar ? "الترتيب" : "Ranking"}
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {metrics.map((m) => (
              <div key={m.k} className="rounded-md bg-background/70 border px-1.5 py-1">
                <div className="text-[10px] text-muted-foreground truncate">{ar ? m.ar : m.en}</div>
                <div className="text-xs font-semibold">{(winner as any)[m.k]}%</div>
              </div>
            ))}
          </div>
          {rest.length > 0 && (
            <ul className="mt-2 divide-y rounded-md border bg-background/60">
              {rest.map((r) => (
                <li key={r.station_id} className="flex items-center gap-2 px-2 py-1 text-xs">
                  <span className="w-4 text-center font-semibold text-muted-foreground">{r.rank}</span>
                  <Medal className={`h-3 w-3 ${r.rank === 2 ? "text-slate-400" : r.rank === 3 ? "text-amber-700" : "text-muted-foreground/40"}`} />
                  <span className="flex-1 truncate">{label(r)} · {r.code}</span>
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
