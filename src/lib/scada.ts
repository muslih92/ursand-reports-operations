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
  | "surge"
  | "general";

export interface ScadaParameter {
  id: string;
  station_id: string;
  equipment_type: EquipmentType;
  equipment_no: number;
  equipment_label?: string | null;
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
  { key: "chiller", en: "Chiller System", ar: "نظام الشيلر" },
  { key: "surge", en: "Surge Vessel", ar: "نظام أوعية التموج" },
  { key: "general", en: "General Readings", ar: "قراءات عامة" },
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

/** Parameters are generated from reading fields: param_key = "f_" + field uuid (no dashes). */
export function fieldIdFromParamKey(paramKey: string | null | undefined): string | null {
  if (!paramKey) return null;
  const raw = paramKey.startsWith("f_") ? paramKey.slice(2) : paramKey;
  const hex = raw.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function slotTs(entryDate: string, slot: string | null, recordedAt: string | null) {
  if (recordedAt) return recordedAt;
  const hhmm = (slot ?? "00:00").slice(0, 5);
  return new Date(`${entryDate}T${hhmm}:00Z`).toISOString();
}

const dayOf = (iso: string) => iso.slice(0, 10);

/**
 * Chart series for a parameter. Values come from the operators' entered readings
 * (reading_values) merged with any manually recorded samples.
 */
export function useScadaSamples(
  parameterId: string | null,
  fromISO: string,
  toISO: string,
  paramKey?: string | null,
) {
  return useQuery({
    queryKey: ["scada-samples", parameterId, paramKey ?? null, fromISO, toISO],
    enabled: !!parameterId,
    refetchInterval: 30000,
    queryFn: async (): Promise<ScadaSample[]> => {
      const out: ScadaSample[] = [];

      const fieldId = fieldIdFromParamKey(paramKey ?? null);
      if (fieldId) {
        const { data, error } = await sb
          .from("reading_values")
          .select("id, value, time_slot, recorded_at, reading_entries!inner(entry_date)")
          .eq("field_id", fieldId)
          .not("value", "is", null)
          .gte("reading_entries.entry_date", dayOf(fromISO))
          .lte("reading_entries.entry_date", dayOf(toISO))
          .limit(5000);
        if (error) throw error;
        for (const r of data ?? []) {
          const entryDate = (r as any).reading_entries?.entry_date as string | undefined;
          if (!entryDate) continue;
          const ts = slotTs(entryDate, r.time_slot, r.recorded_at);
          if (ts < fromISO || ts > toISO) continue;
          out.push({ id: r.id, parameter_id: parameterId!, ts, value: Number(r.value) });
        }
      }

      const { data: manual, error: mErr } = await sb
        .from("scada_samples")
        .select("id, parameter_id, ts, value")
        .eq("parameter_id", parameterId)
        .gte("ts", fromISO)
        .lte("ts", toISO)
        .order("ts");
      if (mErr) throw mErr;
      for (const r of manual ?? []) out.push({ ...r, value: Number(r.value) } as ScadaSample);

      return out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    },
  });
}

/** Latest PV for every parameter of a station (readings first, manual samples as fallback). */
export function useLatestPvs(stationId: string | null, params?: ScadaParameter[] | null) {
  const keyMap = (params ?? [])
    .map((p) => `${p.id}:${p.param_key}`)
    .sort()
    .join(",");
  return useQuery({
    queryKey: ["scada-latest", stationId, keyMap],
    enabled: !!stationId,
    refetchInterval: 30000,
    queryFn: async (): Promise<Record<string, { value: number; ts: string }>> => {
      const out: Record<string, { value: number; ts: string }> = {};

      const byField = new Map<string, string>(); // field id -> parameter id
      for (const p of params ?? []) {
        const fid = fieldIdFromParamKey(p.param_key);
        if (fid) byField.set(fid, p.id);
      }

      if (byField.size > 0) {
        const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const { data, error } = await sb
          .from("reading_values")
          .select("field_id, value, time_slot, recorded_at, reading_entries!inner(entry_date, station_id)")
          .eq("reading_entries.station_id", stationId)
          .gte("reading_entries.entry_date", since)
          .not("value", "is", null)
          .limit(20000);
        if (error) throw error;
        for (const r of data ?? []) {
          const pid = byField.get(r.field_id);
          if (!pid) continue;
          const entryDate = (r as any).reading_entries?.entry_date as string | undefined;
          if (!entryDate) continue;
          const ts = slotTs(entryDate, r.time_slot, r.recorded_at);
          const cur = out[pid];
          if (!cur || cur.ts < ts) out[pid] = { value: Number(r.value), ts };
        }
      }

      const { data: manual, error: mErr } = await sb
        .from("scada_samples")
        .select("parameter_id, value, ts")
        .eq("station_id", stationId)
        .order("ts", { ascending: false })
        .limit(3000);
      if (mErr) throw mErr;
      for (const r of manual ?? []) {
        const cur = out[r.parameter_id];
        if (!cur || cur.ts < r.ts) out[r.parameter_id] = { value: Number(r.value), ts: r.ts };
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
