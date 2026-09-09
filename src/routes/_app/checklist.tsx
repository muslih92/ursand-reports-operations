import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, ExternalLink, RefreshCw, Maximize2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { notifyStation } from "@/lib/notifications";
import { useScopedStations, useStationScope } from "@/lib/station-scope";

interface ChecklistItem {
  [key: string]: string | undefined;
  system: string;
  status?: string;
  note?: string;
  time?: string;
}


interface ChecklistSubmit {
  type: string;
  date?: string;
  shift?: string;
  summary?: { ok: number; remark: number; na: number; total: number };
  remarks?: { system: string; note?: string; time?: string }[];
  items?: ChecklistItem[];
}



const CHECKLIST_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/checklist/index.html`
    : "/checklist/index.html";

export const Route = createFileRoute("/_app/checklist")({
  head: () => ({
    meta: [
      { title: "Station Checklist | WTCO Operations" },
      {
        name: "description",
        content:
          "Standalone station checklist tool embedded inside the WTCO operations portal for quick field checks.",
      },
      { property: "og:title", content: "Station Checklist | WTCO Operations" },
      {
        property: "og:description",
        content: "Embedded station checklist tool for quick field checks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChecklistPage,
});

function ChecklistPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const { profile, roles, isAdmin } = useAuth();
  const { scopedStationId, canPickStation } = useStationScope();
  const { data: stations = [] } = useScopedStations();
  const qc = useQueryClient();
  const [reloadKey, setReloadKey] = useState(0);
  const [stationId, setStationId] = useState<string>("");
  const [listDate, setListDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const frameRef = useRef<HTMLIFrameElement>(null);


  // Auto-select the user's station (or the only one they can access).
  useEffect(() => {
    if (stationId) return;
    const auto = scopedStationId ?? (stations.length === 1 ? stations[0]!.id : "");
    if (auto) setStationId(auto);
  }, [scopedStationId, stations, stationId]);

  const station = stations.find((s) => s.id === stationId) ?? null;
  const role = roles.includes("admin")
    ? "admin"
    : roles.includes("supervisor")
      ? "supervisor"
      : roles.includes("management")
        ? "management"
        : (roles[0] ?? "operator");

  // Stations this user may look at inside the checklist (supervisor panel scope).
  const allowedNames = stations.map((s) => s.name_en);

  // The checklist site expects codes like "ps1c" (lowercase, no separators).
  const slug = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

  const src = useMemo(() => {
    const u = new URL(CHECKLIST_URL, "http://localhost");
    if (station) {
      u.searchParams.set("station", slug(station.code));
      u.searchParams.set("station_code", station.code);
      u.searchParams.set("station_name", ar ? station.name_ar : station.name_en);
    }
    if (profile?.full_name) u.searchParams.set("user", profile.full_name);
    if (profile?.employee_no) u.searchParams.set("employee_no", profile.employee_no);
    if (role) u.searchParams.set("role", role);
    if (allowedNames.length) u.searchParams.set("stations", allowedNames.join("|"));
    u.searchParams.set("lang", locale);
    u.searchParams.set("embedded", "1");
    // Tell the checklist page the visitor is already signed in on our side,
    // so it can skip its own login screen.
    u.searchParams.set("no_login", "1");
    u.searchParams.set("skip_login", "1");
    u.searchParams.set("auth", "wtco");
    return CHECKLIST_URL.startsWith("http") ? u.toString() : u.pathname + u.search;
     
  }, [station, profile?.full_name, profile?.employee_no, role, locale, ar, allowedNames.join("|")]);

  // Also push the context via postMessage for checklist builds that listen for it.
  const pushContext = () => {
    frameRef.current?.contentWindow?.postMessage(
      {
        type: "WTCO_CONTEXT",
        station: station
          ? {
              code: slug(station.code),
              raw_code: station.code,
              name_en: station.name_en,
              name_ar: station.name_ar,
            }
          : null,
        stations: stations.map((s) => ({
          code: slug(s.code),
          raw_code: s.code,
          name_en: s.name_en,
          name_ar: s.name_ar,
        })),
        user: profile
          ? { full_name: profile.full_name, employee_no: profile.employee_no, role }
          : null,
        lang: locale,
      },
      "*",
    );
  };


  // The checklist page announces itself with WTCO_CHECKLIST_READY — resend then,
  // and keep re-sending whenever the selected station / user / language changes.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string } | null;
      const t = data?.type;
      if (t === "WTCO_CHECKLIST_READY" || t === "WTCO_REQUEST_CONTEXT") pushContext();
      if (t === "WTCO_CHECKLIST_SUBMIT") void handleSubmit(data as ChecklistSubmit);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  });

  const reply = (ok: boolean, error?: string) => {
    frameRef.current?.contentWindow?.postMessage({ type: "WTCO_SUBMIT_RESULT", ok, error }, "*");
  };

  const handleSubmit = async (payload: ChecklistSubmit) => {
    if (!stationId) {
      reply(false, ar ? "لم يتم تحديد المحطة" : "No station selected");
      return;
    }
    const s = payload.summary ?? { ok: 0, remark: 0, na: 0, total: 0 };
    const remarks = payload.remarks ?? [];
    const items = payload.items ?? [];
    const done = s.ok + s.remark + s.na;
    const pct = s.total > 0 ? Math.round((done / s.total) * 100) : 0;
    const stationLabel = station ? `${station.code} — ${ar ? station.name_ar : station.name_en}` : "";
    const title = `قائمة فحص المحطة — ${stationLabel} (${payload.date ?? ""} · ${payload.shift ?? ""})`;
    const body =
      `المشغّل: ${profile?.full_name ?? ""} #${profile?.employee_no ?? ""}\n` +
      `سليم: ${s.ok} · ملاحظات: ${s.remark} · غير منطبق: ${s.na} · الإجمالي: ${s.total} · الإنجاز: ${pct}%` +
      (remarks.length
        ? `\n\nالملاحظات:\n` + remarks.map((r) => `• ${r.system}: ${r.note ?? ""} (${r.time ?? ""})`).join("\n")
        : "");
    try {
      const { error } = await supabase.from("checklist_reports").insert({
        station_id: stationId,
        report_date: payload.date ?? new Date().toISOString().slice(0, 10),
        shift: payload.shift ?? "",
        operator_id: profile?.id ?? null,
        operator_name: profile?.full_name ?? null,
        employee_no: profile?.employee_no ?? null,
        ok_count: s.ok,
        remark_count: s.remark,
        na_count: s.na,
        total_count: s.total,
        completion_pct: pct,
        items,
        remarks,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["checklist-reports"] });
      try {
        await notifyStation({
          stationId,
          kind: "checklist_report",
          title,
          body,
          link: "/checklist",
          roles: ["supervisor", "admin", "management"],
        });
      } catch {
        // الحفظ تم؛ فشل الإشعار وحده لا يُفشل التقرير
      }
      toast.success(ar ? "تم حفظ التقرير وإرساله للمشرف" : "Report saved and sent to supervisor");
      reply(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(ar ? `تعذّر إرسال التقرير: ${msg}` : `Failed to send report: ${msg}`);
      reply(false, msg);
    }
  };
  // ── السجل اليومي لقوائم الفحص المحفوظة ─────────────────────────────
  const scopeKey = stations.map((s) => s.id).sort().join(",");
  const [allStations, setAllStations] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: reports = [] } = useQuery({
    queryKey: ["checklist-reports", listDate, allStations ? scopeKey : stationId || scopeKey, allStations],
    enabled: stations.length > 0,
    refetchInterval: 30000,
    queryFn: async () => {
      let q = supabase
        .from("checklist_reports")
        .select("*")
        .eq("report_date", listDate)
        .order("created_at", { ascending: false });
      if (!allStations && stationId) q = q.eq("station_id", stationId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const stationName = (id: string) => {
    const s = stations.find((x) => x.id === id);
    return s ? `${s.code} — ${ar ? s.name_ar : s.name_en}` : "—";
  };

  const removeReport = async (id: string) => {
    if (!confirm(ar ? "حذف هذا التقرير؟" : "Delete this report?")) return;
    const { error } = await supabase.from("checklist_reports").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["checklist-reports"] });
    toast.success(ar ? "تم الحذف" : "Deleted");
  };

  useEffect(() => {
    pushContext();
     
  }, [stationId, locale, profile?.employee_no]);


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ClipboardList className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-xl font-bold truncate">
            {ar ? "قائمة فحص المحطة" : "Station Checklist"}
          </h1>
        </div>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary hover:bg-primary/10 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          {ar ? "تحديث" : "Refresh"}
        </button>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary hover:bg-primary/10 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          {ar ? "فتح في تبويب جديد" : "Open in new tab"}
        </a>
        <button
          onClick={() => {
            const el = document.getElementById("checklist-frame");
            void el?.requestFullscreen?.();
          }}
          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary hover:bg-primary/10 transition-colors"
        >
          <Maximize2 className="h-4 w-4" />
          {ar ? "ملء الشاشة" : "Fullscreen"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
        <span className="font-semibold text-primary">
          {ar ? "المحطة" : "Station"}
        </span>
        {canPickStation && stations.length > 1 ? (
          <select
            value={stationId}
            onChange={(e) => {
              setStationId(e.target.value);
              setReloadKey((k) => k + 1);
            }}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">{ar ? "اختر المحطة" : "Select station"}</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {ar ? s.name_ar : s.name_en}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-lg bg-background border border-input px-3 py-1.5 font-medium">
            {station ? `${station.code} — ${ar ? station.name_ar : station.name_en}` : "—"}
          </span>
        )}
        <span className="text-muted-foreground">
          {ar ? "المستخدم" : "User"}: {profile?.full_name} · #{profile?.employee_no}
          {role ? ` · ${role}` : ""}
        </span>
      </div>

      <div className="rounded-xl border border-primary/20 overflow-hidden bg-card shadow-sm">
        <iframe
          id="checklist-frame"
          ref={frameRef}
          key={`${reloadKey}-${stationId}-${locale}`}
          src={src}
          onLoad={pushContext}
          title={ar ? "قائمة فحص المحطة" : "Station Checklist"}
          className="w-full h-[calc(100vh-17rem)] min-h-[520px] border-0 bg-background"
          allowFullScreen
        />
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <h2 className="font-bold text-sm flex-1">
            {ar ? "سجل قوائم الفحص اليومية" : "Daily checklist records"}
          </h2>
          <input
            type="date"
            value={listDate}
            onChange={(e) => setListDate(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        {reports.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {ar ? "لا توجد تقارير محفوظة في هذا اليوم" : "No saved reports for this day"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2 text-start">{ar ? "المحطة" : "Station"}</th>
                  <th className="p-2 text-start">{ar ? "الوردية" : "Shift"}</th>
                  <th className="p-2 text-start">{ar ? "المشغّل" : "Operator"}</th>
                  <th className="p-2">{ar ? "سليم" : "OK"}</th>
                  <th className="p-2">{ar ? "ملاحظات" : "Remarks"}</th>
                  <th className="p-2">{ar ? "غير منطبق" : "N/A"}</th>
                  <th className="p-2">{ar ? "الإنجاز" : "Completion"}</th>
                  <th className="p-2">{ar ? "الوقت" : "Time"}</th>
                  {isAdmin && <th className="p-2" />}
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="p-2 font-medium">{stationName(r.station_id)}</td>
                    <td className="p-2">{r.shift}</td>
                    <td className="p-2">
                      {r.operator_name}
                      {r.employee_no ? ` #${r.employee_no}` : ""}
                    </td>
                    <td className="p-2 text-center text-emerald-600 font-semibold">{r.ok_count}</td>
                    <td className="p-2 text-center text-amber-600 font-semibold">{r.remark_count}</td>
                    <td className="p-2 text-center text-muted-foreground">{r.na_count}</td>
                    <td className="p-2 text-center">
                      <span
                        className={
                          Number(r.completion_pct) >= 90
                            ? "text-emerald-600 font-bold"
                            : Number(r.completion_pct) >= 60
                              ? "text-amber-600 font-bold"
                              : "text-destructive font-bold"
                        }
                      >
                        {Number(r.completion_pct)}%
                      </span>
                    </td>
                    <td className="p-2 text-center text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleTimeString(ar ? "ar-SA" : "en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    {isAdmin && (
                      <td className="p-2 text-center">
                        <button
                          onClick={() => void removeReport(r.id)}
                          className="p-1.5 rounded text-destructive hover:bg-destructive/10"
                          aria-label={ar ? "حذف" : "Delete"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

  );
}
