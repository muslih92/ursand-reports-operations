import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Raw client for the SCADA tables (generated types may lag behind migrations). */
const sb = supabase as unknown as {
  from: (t: string) => any;
};

export type EquipmentType = "MP" | "BP" | "STATION";
export type GroupKey =
  | "flow"
  | "pressure"
  | "temperature"
  | "vibration"
  | "electrical"
  | "cooling"
  | "chiller"
  | "surge";

export interface ScadaParameter {
  id: string;
  station_id: string;
  equipment_type: EquipmentType;
  equipment_no: number;
  group_key: GroupKey;
  param_key: string;
  name_en: string;
  name_ar: string | null;
  unit: string | null;
  scada_tag: string | null;
  reference_value: number | null;
  limit_mode: "fixed" | "reference";
  hi: number | null;
  hh: number | null;
  lo: number | null;
  ll: number | null;
  min_value: number | null;
  max_value: number | null;
  sort_order: number;
  active: boolean;
}

export interface ScadaSample {
  id: string;
  parameter_id: string;
  ts: string;
  value: number;
}

export type AlarmStatus = "NORMAL" | "HI" | "HH" | "LO" | "LL" | "NO_DATA";

export interface Limits {
  reference: number | null;
  hi: number | null;
  hh: number | null;
  lo: number | null;
  ll: number | null;
  mode: "fixed" | "reference";
}

/**
 * Reference-based dynamic limits:
 *   HI = ref x 1.02, HH = ref x 1.05, LO = ref x 0.98, LL = ref x 0.95
 * Explicit engineering limits always win when present.
 */
export function resolveLimits(p: ScadaParameter): Limits {
  const ref = p.reference_value === null ? null : Number(p.reference_value);
  const num = (v: number | null) => (v === null || v === undefined ? null : Number(v));
  const dyn =
    p.limit_mode === "reference" && ref !== null
      ? {
          hi: ref * 1.02,
          hh: ref * 1.05,
          lo: ref * 0.98,
          ll: ref * 0.95,
        }
      : { hi: null, hh: null, lo: null, ll: null };
  return {
    reference: ref,
    mode: p.limit_mode,
    hi: num(p.hi) ?? dyn.hi,
    hh: num(p.hh) ?? dyn.hh,
    lo: num(p.lo) ?? dyn.lo,
    ll: num(p.ll) ?? dyn.ll,
  };
}

export function evalStatus(pv: number | null | undefined, l: Limits): AlarmStatus {
  if (pv === null || pv === undefined || Number.isNaN(pv)) return "NO_DATA";
  if (l.hh !== null && pv >= l.hh) return "HH";
  if (l.hi !== null && pv >= l.hi) return "HI";
  if (l.ll !== null && pv <= l.ll) return "LL";
  if (l.lo !== null && pv <= l.lo) return "LO";
  return "NORMAL";
}

export const STATUS_STYLE: Record<AlarmStatus, { bg: string; text: string; ring: string }> = {
  NORMAL: { bg: "bg-emerald-500/15", text: "text-emerald-500", ring: "ring-emerald-500/40" },
  HI: { bg: "bg-amber-500/15", text: "text-amber-500", ring: "ring-amber-500/50" },
  HH: { bg: "bg-red-600/20", text: "text-red-500", ring: "ring-red-500/60" },
  LO: { bg: "bg-sky-500/15", text: "text-sky-500", ring: "ring-sky-500/50" },
  LL: { bg: "bg-blue-700/20", text: "text-blue-500", ring: "ring-blue-500/60" },
  NO_DATA: { bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border" },
};

export const RANGES = [
  { key: "15m", minutes: 15, labelEn: "Last 15 min", labelAr: "آخر ١٥ دقيقة" },
  { key: "30m", minutes: 30, labelEn: "Last 30 min", labelAr: "آخر ٣٠ دقيقة" },
  { key: "1h", minutes: 60, labelEn: "Last 1 hour", labelAr: "آخر ساعة" },
  { key: "4h", minutes: 240, labelEn: "Last 4 hours", labelAr: "آخر ٤ ساعات" },
  { key: "8h", minutes: 480, labelEn: "Last 8 hours", labelAr: "آخر ٨ ساعات" },
  { key: "24h", minutes: 1440, labelEn: "Last 24 hours", labelAr: "آخر ٢٤ ساعة" },
  { key: "7d", minutes: 10080, labelEn: "Last 7 days", labelAr: "آخر ٧ أيام" },
  { key: "custom", minutes: 0, labelEn: "Custom range", labelAr: "فترة مخصصة" },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

export const GROUPS: { key: GroupKey; en: string; ar: string }[] = [
  { key: "flow", en: "Flow", ar: "التدفق" },
  { key: "pressure", en: "Pressure", ar: "الضغط" },
  { key: "temperature", en: "Temperature", ar: "درجات الحرارة" },
  { key: "vibration", en: "Vibration", ar: "الاهتزاز" },
  { key: "electrical", en: "Electrical Power", ar: "الكهرباء" },
  { key: "cooling", en: "Cooling System", ar: "نظام التبريد" },
  { key: "surge", en: "Surge Vessel", ar: "أوعية التموج" },
];

export function useScadaParameters(stationId: string | null) {
  return useQuery({
    queryKey: ["scada-parameters", stationId],
    enabled: !!stationId,
    queryFn: async (): Promise<ScadaParameter[]> => {
      const { data, error } = await sb
        .from("scada_parameters")
        .select("*")
        .eq("station_id", stationId)
        .eq("active", true)
        .order("equipment_type")
        .order("equipment_no")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ScadaParameter[];
    },
  });
}

export function useScadaSamples(parameterId: string | null, fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ["scada-samples", parameterId, fromISO, toISO],
    enabled: !!parameterId,
    refetchInterval: 30000,
    queryFn: async (): Promise<ScadaSample[]> => {
      const { data, error } = await sb
        .from("scada_samples")
        .select("id, parameter_id, ts, value")
        .eq("parameter_id", parameterId)
        .gte("ts", fromISO)
        .lte("ts", toISO)
        .order("ts");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, value: Number(r.value) })) as ScadaSample[];
    },
  });
}

/** Latest PV for every parameter of a station. */
export function useLatestPvs(stationId: string | null) {
  return useQuery({
    queryKey: ["scada-latest", stationId],
    enabled: !!stationId,
    refetchInterval: 30000,
    queryFn: async (): Promise<Record<string, { value: number; ts: string }>> => {
      const { data, error } = await sb
        .from("scada_samples")
        .select("parameter_id, value, ts")
        .eq("station_id", stationId)
        .order("ts", { ascending: false })
        .limit(3000);
      if (error) throw error;
      const out: Record<string, { value: number; ts: string }> = {};
      for (const r of data ?? []) {
        if (!out[r.parameter_id]) out[r.parameter_id] = { value: Number(r.value), ts: r.ts };
      }
      return out;
    },
  });
}

export async function insertSample(input: {
  parameter_id: string;
  station_id: string;
  value: number;
  ts?: string;
  recorded_by?: string | null;
}) {
  const { error } = await sb.from("scada_samples").insert({
    parameter_id: input.parameter_id,
    station_id: input.station_id,
    value: input.value,
    ts: input.ts ?? new Date().toISOString(),
    recorded_by: input.recorded_by ?? null,
  });
  if (error) throw error;
}

export async function updateParameterLimits(
  id: string,
  patch: Partial<Pick<ScadaParameter, "reference_value" | "limit_mode" | "hi" | "hh" | "lo" | "ll" | "min_value" | "max_value" | "unit" | "scada_tag">>,
) {
  const { error } = await sb.from("scada_parameters").update(patch).eq("id", id);
  if (error) throw error;
}

export function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: digits });
}
