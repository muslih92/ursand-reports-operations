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
    <div className="rounded-lg border border-amber-400/50 bg-gradient-to-l from-amber-500/10 via-amber-400/5 to-transparent px-3 py-2.5 shadow-sm">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/20 ring-1 ring-amber-400">
          <Crown className="h-4.5 w-4.5 text-amber-500" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
            <Trophy className="h-3 w-3 shrink-0" />
            <span className="truncate">{ar ? "المحطة المثالية" : "Station of the Week"}</span>
          </div>
          <div className="truncate text-sm font-bold leading-tight">
            {label(winner)} <span className="text-xs font-medium text-muted-foreground">· {winner.code}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-base font-extrabold text-amber-600 sm:text-lg">{winner.total_score}</span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={ar ? "التفاصيل والترتيب" : "Details & ranking"}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-amber-400/60 bg-background/60 text-amber-700 transition-colors hover:bg-amber-400/15"
          >
            <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      <div
        className={`grid transition-all duration-300 ease-out ${open ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {metrics.map((m) => (
              <div key={m.k} className="rounded-md bg-background/70 border px-2 py-1">
                <div className="truncate text-[11px] text-muted-foreground">{ar ? m.ar : m.en}</div>
                <div className="text-xs font-semibold">{(winner as any)[m.k]}%</div>
              </div>
            ))}
          </div>
          {rest.length > 0 && (
            <ul className="mt-2 divide-y rounded-md border bg-background/60">
              {rest.map((r) => (
                <li key={r.station_id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                  <span className="w-4 shrink-0 text-center font-semibold text-muted-foreground">{r.rank}</span>
                  <Medal className={`h-3 w-3 shrink-0 ${r.rank === 2 ? "text-slate-400" : r.rank === 3 ? "text-amber-700" : "text-muted-foreground/40"}`} />
                  <span className="min-w-0 flex-1 truncate">{label(r)} · {r.code}</span>
                  <span className="shrink-0 font-semibold">{r.total_score}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
