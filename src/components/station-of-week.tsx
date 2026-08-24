import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { usePersistentToggle } from "@/lib/use-persistent-toggle";
import {
  Crown,
  Medal,
  Trophy,
  ChevronDown,
  Activity,
  ClipboardList,
  Layers,
  FileText,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";

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

const METRICS: { k: keyof Row; ar: string; en: string; Icon: LucideIcon }[] = [
  { k: "availability_score", ar: "تواجدية الوحدات", en: "Availability", Icon: Activity },
  { k: "readings_score", ar: "القراءات", en: "Readings", Icon: ClipboardList },
  { k: "systems_score", ar: "تغطية الأنظمة", en: "Systems", Icon: Layers },
  { k: "reports_score", ar: "التقارير", en: "Reports", Icon: FileText },
  { k: "punctuality_score", ar: "الانتظام بالوقت", en: "Punctuality", Icon: Clock },
];

export function StationOfWeek() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [open, toggle] = usePersistentToggle("card-open:station-of-week");
  const panelId = useId();

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

  return (
    <section
      className="rounded-lg border border-amber-400/50 bg-gradient-to-l from-amber-500/10 via-amber-400/5 to-transparent px-3 py-2.5 shadow-sm"
      aria-label={ar ? "المحطة المثالية للأسبوع" : "Station of the Week"}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/20 ring-1 ring-amber-400">
          <Crown className="h-4 w-4 text-amber-500" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
            <Trophy className="h-3 w-3 shrink-0" aria-hidden="true" />
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
            onClick={toggle}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={
              open
                ? ar ? "إخفاء التفاصيل والترتيب" : "Hide details and ranking"
                : ar ? "عرض التفاصيل والترتيب" : "Show details and ranking"
            }
            className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-400/60 bg-background/60 text-amber-700 transition-colors hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <div
        id={panelId}
        role="region"
        aria-hidden={!open}
        className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${
          open ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {METRICS.map(({ k, ar: a, en, Icon }) => (
              <li
                key={String(k)}
                className="flex items-center gap-2 rounded-md border bg-background/70 px-2 py-1 text-xs"
              >
                <span
                  tabIndex={0}
                  role="img"
                  title={ar ? a : en}
                  aria-label={ar ? a : en}
                  data-testid="metric-tip"
                  className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <Icon className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{ar ? a : en}</span>
                <span className="shrink-0 font-semibold">{winner[k] as number}%</span>
              </li>

            ))}
          </ul>
          {rest.length > 0 && (
            <ul className="mt-2 divide-y rounded-md border bg-background/60">
              {rest.map((r) => (
                <li key={r.station_id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                  <span className="w-4 shrink-0 text-center font-semibold text-muted-foreground">{r.rank}</span>
                  <Medal
                    className={`h-3 w-3 shrink-0 ${r.rank === 2 ? "text-slate-400" : r.rank === 3 ? "text-amber-700" : "text-muted-foreground/40"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{label(r)} · {r.code}</span>
                  <span className="shrink-0 font-semibold">{r.total_score}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
