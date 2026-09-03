import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ClipboardList, ExternalLink, RefreshCw, Maximize2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

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
  const [reloadKey, setReloadKey] = useState(0);
  const ar = locale === "ar";

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
          href={CHECKLIST_URL}
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

      <div className="rounded-xl border border-primary/20 overflow-hidden bg-card shadow-sm">
        <iframe
          id="checklist-frame"
          key={reloadKey}
          src={CHECKLIST_URL}
          title={ar ? "قائمة فحص المحطة" : "Station Checklist"}
          className="w-full h-[calc(100vh-14rem)] min-h-[520px] border-0 bg-background"
          allowFullScreen
        />
      </div>
    </div>
  );
}
