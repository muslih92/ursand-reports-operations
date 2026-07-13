import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_app/readings")({
  component: () => <Placeholder title="القراءات / Readings" />,
});

function Placeholder({ title }: { title: string }) {
  const { locale } = useI18n();
  return (
    <div className="max-w-2xl mx-auto text-center py-16">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-muted-foreground">
        {locale === "ar"
          ? "هذا القسم سيُبنى في المرحلة التالية: إدخال القراءات لكل قالب حسب التردد (ساعة/ساعتين/6 ساعات)."
          : "This section will be built in the next phase: reading entry per template by frequency."}
      </p>
    </div>
  );
}
