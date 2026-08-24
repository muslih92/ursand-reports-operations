import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { usePersistentToggle } from "@/lib/use-persistent-toggle";
import {
  Award,
  ChevronDown,
  Medal,
  ShieldCheck,
  Star,
  CalendarCheck,
  FileText,
  Clock,
  CheckCircle2,
  Activity,
  Route as RouteIcon,
  AlertTriangle,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";

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

const METRICS: Record<"operator" | "supervisor", { k: "m1" | "m2" | "m3" | "m4"; ar: string; en: string; Icon: LucideIcon }[]> = {
  operator: [
    { k: "m1", ar: "انتظام القراءات", en: "Readings days", Icon: CalendarCheck },
    { k: "m2", ar: "تقارير الورديات", en: "Shift reports", Icon: FileText },
    { k: "m3", ar: "الالتزام بالوقت", en: "Punctuality", Icon: Clock },
    { k: "m4", ar: "اكتمال الإدخال", en: "Completeness", Icon: CheckCircle2 },
  ],
  supervisor: [
    { k: "m1", ar: "متابعة التواجدية", en: "Availability", Icon: Activity },
    { k: "m2", ar: "الجولات اليومية", en: "Routines", Icon: RouteIcon },
    { k: "m3", ar: "إغلاق الحوادث", en: "Incidents closed", Icon: AlertTriangle },
    { k: "m4", ar: "سرعة الرد", en: "Responsiveness", Icon: MessageSquare },
  ],
};

function Card({ rows, kind }: { rows: Row[]; kind: "operator" | "supervisor" }) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [open, toggle] = usePersistentToggle(`card-open:staff-of-month:${kind}`);
  const panelId = useId();
  if (rows.length === 0) return null;

  const winner = rows[0];
  const rest = rows.slice(1, 6);
  const isOp = kind === "operator";
  const Icon = isOp ? Star : ShieldCheck;
  const title = isOp
    ? ar ? "الموظف المتميز" : "Employee of the Month"
    : ar ? "المشرف المتميز" : "Supervisor of the Month";

  return (
    <section
      className="rounded-lg border border-primary/30 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent px-3 py-2.5 shadow-sm"
      aria-label={title}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/50">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <Award className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{title}</span>
          </div>
          <div className="truncate text-sm font-bold leading-tight">
            {winner.full_name}
            {winner.station_code ? (
              <span className="text-xs font-medium text-muted-foreground"> · {winner.station_code}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-base font-extrabold text-primary sm:text-lg">{winner.total_score}</span>
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
            className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-background/60 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
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
            {METRICS[kind].map(({ k, ar: a, en, Icon: MIcon }) => (
              <li key={k} className="flex items-center gap-2 rounded-md border bg-background/70 px-2 py-1 text-xs">
                <span
                  tabIndex={0}
                  role="img"
                  title={ar ? a : en}
                  aria-label={ar ? a : en}
                  data-testid="metric-tip"
                  className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <MIcon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{ar ? a : en}</span>
                <span className="shrink-0 font-semibold">{winner[k]}%</span>
              </li>

            ))}
          </ul>
          {rest.length > 0 && (
            <ul className="mt-2 divide-y rounded-md border bg-background/60">
              {rest.map((r) => (
                <li key={r.user_id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                  <span className="w-4 shrink-0 text-center font-semibold text-muted-foreground">{r.rank}</span>
                  <Medal
                    className={`h-3 w-3 shrink-0 ${
                      r.rank === 2 ? "text-slate-400" : r.rank === 3 ? "text-amber-700" : "text-muted-foreground/40"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {r.full_name}
                    {r.station_code ? ` · ${r.station_code}` : ""}
                  </span>
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
