import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/incidents")({
  component: () => {
    const { locale } = useI18n();
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <h1 className="text-2xl font-bold">{locale === "ar" ? "الحوادث" : "Incidents"}</h1>
        <p className="mt-3 text-muted-foreground">
          {locale === "ar" ? "قسم تقارير الحوادث — يُبنى في المرحلة 5." : "Incidents module — built in phase 5."}
        </p>
      </div>
    );
  },
});
