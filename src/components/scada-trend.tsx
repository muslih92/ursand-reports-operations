import { useMemo } from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  evalStatus,
  fmt,
  resolveLimits,
  STATUS_STYLE,
  type ScadaParameter,
  type ScadaSample,
} from "@/lib/scada";

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const s = STATUS_STYLE[status as keyof typeof STATUS_STYLE] ?? STATUS_STYLE.NO_DATA;
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold tracking-wider ring-1 ${s.bg} ${s.text} ${s.ring} ${className}`}
    >
      {status === "NO_DATA" ? "NO DATA" : status}
    </span>
  );
}

function tsLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Reusable, configuration-driven SCADA trend.
 * The same component renders every station / equipment / parameter combination.
 */
export function ScadaTrend({
  parameter,
  samples,
  stationLabel,
  equipmentLabel,
  locale,
  height = 320,
}: {
  parameter: ScadaParameter;
  samples: ScadaSample[];
  stationLabel: string;
  equipmentLabel: string;
  locale: string;
  height?: number;
}) {
  const limits = useMemo(() => resolveLimits(parameter), [parameter]);
  const last = samples.length > 0 ? samples[samples.length - 1]! : null;
  const pv = last ? last.value : null;
  const status = evalStatus(pv, limits);
  const name = locale === "ar" ? parameter.name_ar || parameter.name_en : parameter.name_en;
  const unit = parameter.unit ?? "";

  const data = samples.map((s) => ({ ts: s.ts, t: tsLabel(s.ts), pv: s.value }));

  const yValues = [
    ...samples.map((s) => s.value),
    limits.hh,
    limits.hi,
    limits.lo,
    limits.ll,
    limits.reference,
    parameter.min_value === null ? null : Number(parameter.min_value),
    parameter.max_value === null ? null : Number(parameter.max_value),
  ].filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
  const yMin = yValues.length ? Math.min(...yValues) : 0;
  const yMax = yValues.length ? Math.max(...yValues) : 1;
  const pad = (yMax - yMin || Math.abs(yMax) || 1) * 0.08;

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header bar — station / equipment / parameter / status */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-3 py-2">
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {stationLabel} · {equipmentLabel}
        </div>
        <div className="font-semibold text-sm">{name}</div>
        {parameter.scada_tag && (
          <div className="font-mono text-[10px] text-muted-foreground">{parameter.scada_tag}</div>
        )}
        <div className="ms-auto flex items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-lg font-bold leading-none">
              {fmt(pv)} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {last ? tsLabel(last.ts) : locale === "ar" ? "لا توجد قراءات" : "No samples"}
            </div>
          </div>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Limits strip */}
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-5">
        {[
          { k: "HH", v: limits.hh, c: "text-red-500" },
          { k: "HI", v: limits.hi, c: "text-amber-500" },
          { k: locale === "ar" ? "المرجعية" : "REF", v: limits.reference, c: "text-primary" },
          { k: "LO", v: limits.lo, c: "text-sky-500" },
          { k: "LL", v: limits.ll, c: "text-blue-500" },
        ].map((x) => (
          <div key={x.k} className="bg-card px-2 py-1.5 text-center">
            <div className={`text-[10px] font-bold tracking-wider ${x.c}`}>{x.k}</div>
            <div className="font-mono text-xs">{fmt(x.v)}</div>
          </div>
        ))}
      </div>

      <div style={{ height }} dir="ltr" className="p-2">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {locale === "ar" ? "لا توجد بيانات في هذه الفترة" : "No data in this period"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={52} />
              <YAxis
                tick={{ fontSize: 10 }}
                domain={[yMin - pad, yMax + pad]}
                width={64}
                tickFormatter={(v) => fmt(v, 1)}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const row: any = payload[0]!.payload;
                  const st = evalStatus(row.pv, limits);
                  return (
                    <div className="rounded border bg-popover p-2 text-xs shadow-lg">
                      <div className="font-mono text-[11px] text-muted-foreground">{row.t}</div>
                      <div className="mt-1 font-mono font-bold">
                        PV: {fmt(row.pv)} {unit}
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-x-3 font-mono text-[11px]">
                        <span>REF</span><span>{fmt(limits.reference)}</span>
                        <span>HI</span><span>{fmt(limits.hi)}</span>
                        <span>HH</span><span>{fmt(limits.hh)}</span>
                        <span>LO</span><span>{fmt(limits.lo)}</span>
                        <span>LL</span><span>{fmt(limits.ll)}</span>
                      </div>
                      <div className="mt-1">
                        <StatusBadge status={st} />
                      </div>
                    </div>
                  );
                }}
              />
              <Legend verticalAlign="top" height={22} wrapperStyle={{ fontSize: 11 }} />
              {limits.hh !== null && (
                <ReferenceLine y={limits.hh} stroke="#dc2626" strokeDasharray="6 3" label={{ value: "HH", position: "right", fontSize: 10, fill: "#dc2626" }} />
              )}
              {limits.hi !== null && (
                <ReferenceLine y={limits.hi} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: "HI", position: "right", fontSize: 10, fill: "#f59e0b" }} />
              )}
              {limits.reference !== null && (
                <ReferenceLine y={limits.reference} stroke="#0ea5e9" strokeDasharray="2 2" label={{ value: "REF", position: "right", fontSize: 10, fill: "#0ea5e9" }} />
              )}
              {limits.lo !== null && (
                <ReferenceLine y={limits.lo} stroke="#38bdf8" strokeDasharray="4 3" label={{ value: "LO", position: "right", fontSize: 10, fill: "#38bdf8" }} />
              )}
              {limits.ll !== null && (
                <ReferenceLine y={limits.ll} stroke="#2563eb" strokeDasharray="6 3" label={{ value: "LL", position: "right", fontSize: 10, fill: "#2563eb" }} />
              )}
              {parameter.min_value !== null && (
                <ReferenceLine y={Number(parameter.min_value)} stroke="#64748b" strokeDasharray="1 4" label={{ value: "MIN", position: "left", fontSize: 10, fill: "#64748b" }} />
              )}
              {parameter.max_value !== null && (
                <ReferenceLine y={Number(parameter.max_value)} stroke="#64748b" strokeDasharray="1 4" label={{ value: "MAX", position: "left", fontSize: 10, fill: "#64748b" }} />
              )}
              <Area type="monotone" dataKey="pv" stroke="none" fill="#22c55e" fillOpacity={0.08} legendType="none" />
              <Line
                type="monotone"
                dataKey="pv"
                name={`PV ${unit}`}
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 1.5 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
