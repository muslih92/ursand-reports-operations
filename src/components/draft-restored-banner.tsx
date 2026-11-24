import { History } from "lucide-react";

/** Shown when unsaved input from an earlier visit was put back into a form. */
export function DraftRestoredBanner({
  at,
  locale,
  onDiscard,
}: {
  at: number;
  locale: string;
  onDiscard?: () => void;
}) {
  const ar = locale === "ar";
  const when = new Date(at).toLocaleString(ar ? "ar-SA" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  });
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 print:hidden"
    >
      <History className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-[12rem]">
        {ar
          ? `تمت استعادة بيانات لم تُحفظ من آخر زيارة (${when}). راجعها ثم اضغط «حفظ».`
          : `Unsaved input from your last visit (${when}) was restored. Review it, then press Save.`}
      </span>
      {onDiscard && (
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md border border-amber-400 px-2 py-1 text-xs hover:bg-amber-100 dark:hover:bg-amber-900"
        >
          {ar ? "تجاهل واسترجاع المحفوظ" : "Discard and reload saved"}
        </button>
      )}
    </div>
  );
}
