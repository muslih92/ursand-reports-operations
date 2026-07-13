import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/reports")({
  component: () => {
    const { locale } = useI18n();
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <h1 className="text-2xl font-bold">{locale === "ar" ? "التقارير" : "Reports"}</h1>
        <p className="mt-3 text-muted-foreground">
          {locale === "ar" ? "تقارير Excel/PDF — يُبنى في المرحلة 6." : "Excel/PDF reports — built in phase 6."}
        </p>
      </div>
    );
  },
});
