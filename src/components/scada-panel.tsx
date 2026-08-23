import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Gauge, Plus, Save, Settings2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useScopedStations, useStationScope } from "@/lib/station-scope";
import { ScadaTrend, StatusBadge } from "@/components/scada-trend";
import {
  evalStatus,
  fmt,
  GROUPS,
  insertSample,
  RANGES,
  resolveLimits,
  updateParameterLimits,
  useLatestPvs,
  useScadaParameters,
  useScadaSamples,
  type GroupKey,
  type RangeKey,
  type ScadaParameter,
} from "@/lib/scada";

function equipLabel(p: ScadaParameter, locale: string) {
  if (p.equipment_type === "STATION") return locale === "ar" ? "المحطة" : "Station";
  const base = p.equipment_type === "MP" ? (locale === "ar" ? "مضخة رئيسية" : "Main Pump") : locale === "ar" ? "مضخة مساعدة" : "Booster Pump";
  return `${base} ${p.equipment_no}`;
}

export function ScadaPanel() {
  const { locale, dir } = useI18n();
  const { isAdmin, hasRole, profile } = useAuth();
  const canConfigure = isAdmin || hasRole("supervisor");
  const { scopedStationId, canPickStation } = useStationScope();
  const { data: stations } = useScopedStations();
  const qc = useQueryClient();

  const [stationId, setStationId] = useState<string>(scopedStationId ?? "");
  const [group, setGroup] = useState<GroupKey>("temperature");
  const [equipKey, setEquipKey] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [rangeKey, setRangeKey] = useState<RangeKey>("8h");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [showConfig, setShowConfig] = useState(false);
  const [entry, setEntry] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!stationId && (scopedStationId || (stations && stations.length === 1))) {
      setStationId(scopedStationId ?? stations![0]!.id);
    }
  }, [scopedStationId, stations, stationId]);

  const { data: params } = useScadaParameters(stationId || null);
  const { data: latest } = useLatestPvs(stationId || null);

  const equipments = useMemo(() => {
    const set = new Map<string, { type: string; no: number; label: string }>();
    for (const p of params ?? []) {
      const key = `${p.equipment_type}-${p.equipment_no}`;
      if (!set.has(key)) set.set(key, { type: p.equipment_type, no: p.equipment_no, label: equipLabel(p, locale) });
    }
    return Array.from(set.entries()).map(([key, v]) => ({ key, ...v }));
  }, [params, locale]);

  useEffect(() => {
    if (equipments.length > 0 && !equipments.some((e) => e.key === equipKey)) {
      setEquipKey(equipments[0]!.key);
    }
  }, [equipments, equipKey]);

  const groupsForEquip = useMemo(() => {
    const keys = new Set((params ?? []).filter((p) => `${p.equipment_type}-${p.equipment_no}` === equipKey).map((p) => p.group_key));
    return GROUPS.filter((g) => keys.has(g.key));
  }, [params, equipKey]);

  useEffect(() => {
    if (groupsForEquip.length > 0 && !groupsForEquip.some((g) => g.key === group)) {
      setGroup(groupsForEquip[0]!.key);
    }
  }, [groupsForEquip, group]);

  const visible = useMemo(
    () =>
      (params ?? []).filter(
        (p) => `${p.equipment_type}-${p.equipment_no}` === equipKey && p.group_key === group,
      ),
    [params, equipKey, group],
  );

  useEffect(() => {
    if (visible.length > 0 && !visible.some((p) => p.id === selectedId)) setSelectedId(visible[0]!.id);
  }, [visible, selectedId]);

  const selected = (params ?? []).find((p) => p.id === selectedId) ?? null;

  const { fromISO, toISO } = useMemo(() => {
    if (rangeKey === "custom" && customFrom && customTo) {
      return { fromISO: new Date(customFrom).toISOString(), toISO: new Date(customTo).toISOString() };
    }
    const r = RANGES.find((x) => x.key === rangeKey) ?? RANGES[4];
    const to = new Date();
    const from = new Date(to.getTime() - (r.minutes || 480) * 60000);
    return { fromISO: from.toISOString(), toISO: to.toISOString() };
  }, [rangeKey, customFrom, customTo]);

  const { data: samples } = useScadaSamples(selectedId || null, fromISO, toISO);

  const station = (stations ?? []).find((s) => s.id === stationId);
  const stationLabel = station?.code ?? "";
  const equipmentLabel = equipments.find((e) => e.key === equipKey)?.label ?? "";

  const alarmCount = useMemo(() => {
    let n = 0;
    for (const p of params ?? []) {
      const st = evalStatus(latest?.[p.id]?.value ?? null, resolveLimits(p));
      if (st === "HI" || st === "HH" || st === "LO" || st === "LL") n++;
    }
    return n;
  }, [params, latest]);

  const saveSamples = async () => {
    const rows = Object.entries(entry).filter(([, v]) => v.trim() !== "");
    if (rows.length === 0) return toast.error(locale === "ar" ? "لا توجد قيم للحفظ" : "Nothing to save");
    setBusy(true);
    try {
      const ts = new Date().toISOString();
      for (const [pid, val] of rows) {
        await insertSample({ parameter_id: pid, station_id: stationId, value: Number(val), ts, recorded_by: profile?.id ?? null });
      }
      setEntry({});
      await qc.invalidateQueries({ queryKey: ["scada-latest", stationId] });
      await qc.invalidateQueries({ queryKey: ["scada-samples"] });
      toast.success(locale === "ar" ? "تم تسجيل القراءات" : "Samples recorded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveLimits = async (p: ScadaParameter, patch: Record<string, unknown>) => {
    try {
      await updateParameterLimits(p.id, patch as never);
      await qc.invalidateQueries({ queryKey: ["scada-parameters", stationId] });
      toast.success(locale === "ar" ? "تم تحديث الحدود" : "Limits updated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4" dir={dir}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Activity className="h-5 w-5 text-primary" />
          {locale === "ar" ? "نظام الترند ومراقبة حدود التشغيل" : "SCADA Trends & Operating Limits"}
        </h1>
        <span
          className={`rounded px-2 py-1 text-xs font-bold ${
            alarmCount > 0 ? "bg-red-500/15 text-red-500" : "bg-emerald-500/15 text-emerald-500"
          }`}
        >
          {alarmCount > 0
            ? `${alarmCount} ${locale === "ar" ? "إنذار نشط" : "active alarms"}`
            : locale === "ar"
              ? "جميع القيم ضمن الحدود"
              : "All values within limits"}
        </span>
        {canConfigure && (
          <button
            onClick={() => setShowConfig((v) => !v)}
            className="ms-auto inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-accent"
          >
            <Settings2 className="h-4 w-4" />
            {locale === "ar" ? "إعداد الحدود" : "Configure limits"}
          </button>
        )}
      </div>

      {/* Sticky selector bar */}
      <div className="sticky top-0 z-20 grid gap-3 rounded-xl border bg-card/95 p-3 backdrop-blur md:grid-cols-3 lg:grid-cols-5">
        <label className="space-y-1 text-sm">
          <span className="font-medium">{locale === "ar" ? "المحطة" : "Station"}</span>
          <select
            value={stationId}
            onChange={(e) => {
              setStationId(e.target.value);
              setEquipKey("");
              setSelectedId("");
            }}
            disabled={!canPickStation}
            className="h-10 w-full rounded-lg border bg-background px-2 disabled:opacity-70"
          >
            <option value="">--</option>
            {(stations ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">{locale === "ar" ? "المعدة" : "Equipment"}</span>
          <select
            value={equipKey}
            onChange={(e) => setEquipKey(e.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-2"
          >
            {equipments.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">{locale === "ar" ? "النظام / المجموعة" : "System / Group"}</span>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as GroupKey)}
            className="h-10 w-full rounded-lg border bg-background px-2"
          >
            {groupsForEquip.map((g) => (
              <option key={g.key} value={g.key}>
                {locale === "ar" ? g.ar : g.en}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">{locale === "ar" ? "الفترة" : "Time range"}</span>
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value as RangeKey)}
            className="h-10 w-full rounded-lg border bg-background px-2"
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {locale === "ar" ? r.labelAr : r.labelEn}
              </option>
            ))}
          </select>
        </label>

        {rangeKey === "custom" && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <input
              type="datetime-local"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-2"
            />
            <input
              type="datetime-local"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-2"
            />
          </div>
        )}
      </div>

      {/* Parameter tiles */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((p) => {
          const limits = resolveLimits(p);
          const pv = latest?.[p.id]?.value ?? null;
          const st = evalStatus(pv, limits);
          const active = p.id === selectedId;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`rounded-lg border p-3 text-start transition-colors ${
                active ? "border-primary ring-1 ring-primary" : "hover:bg-accent"
              }`}
            >
              <div className="flex items-start gap-2">
                <Gauge className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">
                    {locale === "ar" ? p.name_ar || p.name_en : p.name_en}
                  </div>
                  <div className="mt-1 font-mono text-lg font-bold">
                    {fmt(pv)} <span className="text-[10px] font-normal text-muted-foreground">{p.unit}</span>
                  </div>
                </div>
                <StatusBadge status={st} />
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1 font-mono text-[10px] text-muted-foreground">
                <span>LL {fmt(limits.ll, 1)}</span>
                <span>LO {fmt(limits.lo, 1)}</span>
                <span>HI {fmt(limits.hi, 1)}</span>
                <span>HH {fmt(limits.hh, 1)}</span>
              </div>
            </button>
          );
        })}
        {visible.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {locale === "ar" ? "لا توجد متغيرات لهذا الاختيار" : "No parameters for this selection"}
          </div>
        )}
      </div>

      {/* Trend */}
      {selected && (
        <ScadaTrend
          parameter={selected}
          samples={samples ?? []}
          stationLabel={stationLabel}
          equipmentLabel={equipmentLabel}
          locale={locale}
          height={360}
        />
      )}

      {/* Manual sampling */}
      {visible.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">
              {locale === "ar" ? "تسجيل قراءات الآن" : "Record samples now"}
            </div>
            <button
              onClick={saveSamples}
              disabled={busy}
              className="ms-auto inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {locale === "ar" ? "حفظ" : "Save"}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p) => (
              <label key={p.id} className="space-y-1 text-xs">
                <span className="block truncate font-medium">
                  {locale === "ar" ? p.name_ar || p.name_en : p.name_en} {p.unit ? `(${p.unit})` : ""}
                </span>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={entry[p.id] ?? ""}
                  onChange={(e) => setEntry((c) => ({ ...c, [p.id]: e.target.value }))}
                  className="h-9 w-full rounded-lg border bg-background px-2 font-mono"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Limit configuration */}
      {canConfigure && showConfig && (
        <div className="overflow-auto rounded-xl border bg-card p-4">
          <div className="mb-2 text-sm font-semibold">
            {locale === "ar"
              ? "حدود التشغيل (اترك الحقل فارغاً لاستخدام الحساب من القيمة المرجعية)"
              : "Operating limits (leave blank to derive from the reference value)"}
          </div>
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="border px-2 py-1 text-start">{locale === "ar" ? "المتغير" : "Parameter"}</th>
                <th className="border px-2 py-1">{locale === "ar" ? "الوضع" : "Mode"}</th>
                <th className="border px-2 py-1">REF</th>
                <th className="border px-2 py-1">LL</th>
                <th className="border px-2 py-1">LO</th>
                <th className="border px-2 py-1">HI</th>
                <th className="border px-2 py-1">HH</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id}>
                  <td className="border px-2 py-1">{locale === "ar" ? p.name_ar || p.name_en : p.name_en}</td>
                  <td className="border px-1 py-1">
                    <select
                      defaultValue={p.limit_mode}
                      onChange={(e) => saveLimits(p, { limit_mode: e.target.value })}
                      className="h-8 w-full rounded border bg-background px-1"
                    >
                      <option value="fixed">{locale === "ar" ? "ثابت" : "Fixed"}</option>
                      <option value="reference">{locale === "ar" ? "مرجعي" : "Reference"}</option>
                    </select>
                  </td>
                  {(["reference_value", "ll", "lo", "hi", "hh"] as const).map((f) => (
                    <td key={f} className="border px-1 py-1">
                      <input
                        type="number"
                        step="any"
                        defaultValue={p[f] ?? ""}
                        onBlur={(e) =>
                          saveLimits(p, { [f]: e.target.value === "" ? null : Number(e.target.value) })
                        }
                        className="h-8 w-24 rounded border bg-background px-1 font-mono"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
