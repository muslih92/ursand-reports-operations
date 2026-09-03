import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, ExternalLink, RefreshCw, Maximize2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useScopedStations, useStationScope } from "@/lib/station-scope";

const CHECKLIST_URL = "https://falgimajid-art.github.io/STATIONCHECKLIST/";

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
  const { profile, roles } = useAuth();
  const { scopedStationId, canPickStation } = useStationScope();
  const { data: stations = [] } = useScopedStations();
  const [reloadKey, setReloadKey] = useState(0);
  const [stationId, setStationId] = useState<string>("");
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Auto-select the user's station (or the only one they can access).
  useEffect(() => {
    if (stationId) return;
    const auto = scopedStationId ?? (stations.length === 1 ? stations[0]!.id : "");
    if (auto) setStationId(auto);
  }, [scopedStationId, stations, stationId]);

  const station = stations.find((s) => s.id === stationId) ?? null;
  const role = roles[0] ?? "";

  const src = useMemo(() => {
    const u = new URL(CHECKLIST_URL);
    if (station) {
      u.searchParams.set("station", station.code);
      u.searchParams.set("station_name", ar ? station.name_ar : station.name_en);
    }
    if (profile?.full_name) u.searchParams.set("user", profile.full_name);
    if (profile?.employee_no) u.searchParams.set("employee_no", profile.employee_no);
    if (role) u.searchParams.set("role", role);
    u.searchParams.set("lang", locale);
    u.searchParams.set("embedded", "1");
    return u.toString();
  }, [station, profile?.full_name, profile?.employee_no, role, locale, ar]);

  // Also push the context via postMessage for checklist builds that listen for it.
  const pushContext = () => {
    frameRef.current?.contentWindow?.postMessage(
      {
        type: "WTCO_CONTEXT",
        station: station ? { code: station.code, name_en: station.name_en, name_ar: station.name_ar } : null,
        user: profile
          ? { full_name: profile.full_name, employee_no: profile.employee_no, role }
          : null,
        lang: locale,
      },
      "*",
    );
  };

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
    </div>
  );
}
