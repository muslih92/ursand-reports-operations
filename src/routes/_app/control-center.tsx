import { createFileRoute } from "@tanstack/react-router";
import { Radio, Clock, Database } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/control-center")({
  head: () => ({
    meta: [
      { title: "Control Center | WTCO" },
      {
        name: "description",
        content:
          "Control center staff workspace — prepared and ready while the required operational data is being collected.",
      },
      { property: "og:title", content: "Control Center" },
      {
        property: "og:description",
        content: "Dedicated control center section, ready for the operational data once collected.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ControlCenterPage,
});

function ControlCenterPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Radio className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">{ar ? "مركز التحكم" : "Control Center"}</h1>
          <p className="text-sm text-muted-foreground">
            {ar
              ? "قسم خاص بموظفي مركز التحكم"
              : "Dedicated section for control center staff"}
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-10 text-center space-y-4">
        <Clock className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="text-lg font-semibold">
          {ar ? "جاهز — بانتظار تجميع البيانات" : "Ready — awaiting data collection"}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          {ar
            ? "تم تجهيز هذه الخانة لموظفي مركز التحكم، وستُفعّل نماذج الإدخال والتقارير فور تجميع البيانات المطلوبة وإدراجها."
            : "This section is prepared for control center staff. Entry forms and reports will be activated as soon as the required data is collected and inserted."}
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Database className="h-4 w-4" />
          {ar ? "لا توجد بيانات مدرجة حتى الآن" : "No data inserted yet"}
        </div>
      </div>
    </div>
  );
}
