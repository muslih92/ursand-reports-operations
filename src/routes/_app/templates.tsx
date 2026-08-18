import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { AdminOnly } from "@/components/admin-only";

export const Route = createFileRoute("/_app/templates")({
  component: () => {
    const { locale } = useI18n();
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <h1 className="text-2xl font-bold">{locale === "ar" ? "قوالب القراءات" : "Reading Templates"}</h1>
        <p className="mt-3 text-muted-foreground">
          {locale === "ar" ? "إدارة القوالب والحقول — يُبنى في المرحلة 3." : "Template & fields management — built in phase 3."}
        </p>
      </div>
    );
  },
});
