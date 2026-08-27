import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ExternalLink, RefreshCw, Save, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/powerbi")({
  head: () => ({
    meta: [
      { title: "Power BI Analytics | WTCO Operations" },
      {
        name: "description",
        content:
          "Live Power BI dashboard embedded inside the WTCO operations system, always showing the latest published report data.",
      },
      { property: "og:title", content: "Power BI Analytics | WTCO Operations" },
      {
        property: "og:description",
        content: "Embedded Power BI report with live refresh inside the operations portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PowerBiPage,
});

const SETTING_KEY = "powerbi_report";

interface PowerBiSetting {
  url: string;
  title?: string;
}

function isAllowedEmbedUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return /(^|\.)powerbi\.com$/.test(u.hostname) || /(^|\.)microsoft\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

function PowerBiPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [draftUrl, setDraftUrl] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [frameKey, setFrameKey] = useState(0);

  const { data: setting, isLoading } = useQuery({
    queryKey: ["app-setting", SETTING_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      return (data?.value ?? null) as PowerBiSetting | null;
    },
  });

  useEffect(() => {
    setDraftUrl(setting?.url ?? "");
    setDraftTitle(setting?.title ?? "");
  }, [setting?.url, setting?.title]);

  const save = useMutation({
    mutationFn: async () => {
      const url = draftUrl.trim();
      if (url && !isAllowedEmbedUrl(url)) {
        throw new Error(
          ar
            ? "الرابط غير صالح — يجب أن يكون رابط تضمين من app.powerbi.com"
            : "Invalid link — it must be a Power BI embed link (app.powerbi.com)",
        );
      }
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: SETTING_KEY, value: { url, title: draftTitle.trim() } }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(ar ? "تم حفظ رابط التقرير" : "Report link saved");
      void qc.invalidateQueries({ queryKey: ["app-setting", SETTING_KEY] });
      setFrameKey((k) => k + 1);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const url = setting?.url?.trim() ?? "";
  const valid = !!url && isAllowedEmbedUrl(url);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <BarChart3 className="h-6 w-6 text-primary" />
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-bold">
            {setting?.title || (ar ? "لوحة Power BI" : "Power BI Dashboard")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {ar
              ? "التقرير يعرض أحدث البيانات المنشورة تلقائياً عند كل فتح للصفحة"
              : "The report always shows the latest published data on every visit"}
          </p>
        </div>
        {valid && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFrameKey((k) => k + 1)}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
            >
              <RefreshCw className="h-4 w-4" />
              {ar ? "تحديث" : "Refresh"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent"
            >
              <ExternalLink className="h-4 w-4" />
              {ar ? "فتح في نافذة جديدة" : "Open in new tab"}
            </a>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="h-[70vh] rounded-xl border bg-muted/30 animate-pulse" />
      ) : valid ? (
        <div className="rounded-xl border overflow-hidden bg-card">
          <iframe
            key={frameKey}
            title={setting?.title || "Power BI report"}
            src={url}
            className="w-full h-[75vh] border-0"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-8 text-center space-y-2">
          <Maximize2 className="h-8 w-8 mx-auto text-muted-foreground" />
          <h2 className="font-semibold">
            {ar ? "لم يتم ربط تقرير Power BI بعد" : "No Power BI report linked yet"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            {ar
              ? "من Power BI: File → Embed report → Publish to web (public) أو Embed for organization، ثم انسخ رابط الـ iframe (src) وألصقه هنا (مسؤول النظام فقط)."
              : "In Power BI: File → Embed report → Publish to web (public) or Embed for organization, then copy the iframe src link and paste it below (admins only)."}
          </p>
        </div>
      )}

      {isAdmin && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold text-sm">
            {ar ? "إعداد التقرير (مسؤول النظام)" : "Report settings (admin)"}
          </h2>
          <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder={ar ? "اسم اللوحة" : "Dashboard title"}
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            />
            <input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://app.powerbi.com/reportEmbed?reportId=..."
              dir="ltr"
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {ar ? "حفظ" : "Save"}
          </button>
          <p className="text-xs text-muted-foreground">
            {ar
              ? "يقبل النظام روابط app.powerbi.com فقط. أي تحديث في التقرير داخل Power BI يظهر هنا تلقائياً بدون تعديل."
              : "Only app.powerbi.com links are accepted. Any update made in Power BI appears here automatically."}
          </p>
        </div>
      )}
    </div>
  );
}
