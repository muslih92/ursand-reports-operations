import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, Clock3, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { restoreDeletedItem } from "@/lib/trash.functions";

export const Route = createFileRoute("/_app/trash")({
  head: () => ({
    meta: [
      { title: "Recycle Bin | WTCO Operations" },
      { name: "description", content: "Restore operational records deleted during the last 30 days." },
      { property: "og:title", content: "Recycle Bin | WTCO Operations" },
      { property: "og:description", content: "Restore recently deleted operational records securely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrashPage,
});

interface DeletedItem {
  id: string;
  table_name: string;
  record_id: string;
  station_id: string | null;
  record_label: string | null;
  deletion_txid: number;
  deleted_by: string;
  deleted_at: string;
  row_data: Record<string, unknown>;
}

const LABELS: Record<string, { ar: string; en: string }> = {
  shift_reports: { ar: "تقرير مناوبة", en: "Shift report" },
  supervisor_routines: { ar: "روتين المشرف", en: "Supervisor routine" },
  reading_entries: { ar: "سجل قراءات", en: "Reading record" },
  equipment_availability_entries: { ar: "تقرير التواجدية", en: "Availability report" },
  checklist_reports: { ar: "تقرير قائمة الفحص", en: "Checklist report" },
  fire_pump_tests: { ar: "اختبار مضخة حريق", en: "Fire pump test" },
  generator_tests: { ar: "اختبار مولد الطوارئ", en: "Generator test" },
  incidents: { ar: "تقرير حادث", en: "Incident report" },
  incident_attachments: { ar: "مرفق حادث", en: "Incident attachment" },
  defeat_records: { ar: "سجل إبطال حماية", en: "Defeat record" },
  station_messages: { ar: "محادثة محطة", en: "Station message" },
  station_notes: { ar: "بلاغ محطة", en: "Station note" },
};

const CHILD_TABLES = new Set([
  "reading_values",
  "equipment_availability_values",
  "checklist_entries",
]);

function TrashPage() {
  const { locale, dir } = useI18n();
  const ar = locale === "ar";
  const qc = useQueryClient();
  const restore = useServerFn(restoreDeletedItem);

  const { data, isLoading, error } = useQuery({
    queryKey: ["deleted-items"],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: items, error: itemsError } = await supabase
        .from("deleted_items")
        .select("id, table_name, record_id, station_id, record_label, deletion_txid, deleted_by, deleted_at, row_data")
        .is("restored_at", null)
        .gte("deleted_at", cutoff)
        .order("deleted_at", { ascending: false })
        .limit(500);
      if (itemsError) throw itemsError;
      return (items ?? []) as DeletedItem[];
    },
  });

  const items = (data ?? []).filter((item, index, all) => {
    if (CHILD_TABLES.has(item.table_name)) {
      return !all.some((candidate) => candidate.deletion_txid === item.deletion_txid && !CHILD_TABLES.has(candidate.table_name));
    }
    return all.findIndex((candidate) => candidate.deletion_txid === item.deletion_txid && !CHILD_TABLES.has(candidate.table_name)) === index;
  });

  const restoreMutation = useMutation({
    mutationFn: (itemId: string) => restore({ data: { itemId } }),
    onSuccess: async () => {
      toast.success(ar ? "تمت الاستعادة" : "Restored");
      await qc.invalidateQueries();
    },
    onError: (restoreError: Error) => toast.error(restoreError.message),
  });

  return (
    <div className="space-y-5" dir={dir}>
      <div className="flex items-start gap-3">
        <Trash2 className="mt-1 h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{ar ? "سلة المحذوفات" : "Recycle Bin"}</h1>
          <p className="text-sm text-muted-foreground">
            {ar ? "يمكن استعادة العناصر خلال 30 يومًا من الحذف" : "Deleted items can be restored for 30 days"}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">{ar ? "جارٍ التحميل..." : "Loading..."}</div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border bg-card py-14 text-center">
          <ArchiveRestore className="mx-auto h-9 w-9 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">{ar ? "لا توجد عناصر قابلة للاستعادة" : "No restorable items"}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{ar ? "النوع" : "Type"}</th>
                <th className="px-4 py-3 text-start font-medium">{ar ? "السجل" : "Record"}</th>
                <th className="px-4 py-3 text-start font-medium">{ar ? "وقت الحذف" : "Deleted"}</th>
                <th className="px-4 py-3 text-end font-medium">{ar ? "الإجراء" : "Action"}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => {
                const label = LABELS[item.table_name] ?? { ar: item.table_name, en: item.table_name };
                const expiresAt = new Date(new Date(item.deleted_at).getTime() + 30 * 24 * 60 * 60 * 1000);
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium">{ar ? label.ar : label.en}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.record_label ?? item.record_id.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <div>{new Date(item.deleted_at).toLocaleString(ar ? "ar-SA" : "en-GB")}</div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        {ar ? "متاح حتى" : "Available until"} {expiresAt.toLocaleDateString(ar ? "ar-SA" : "en-GB")}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={restoreMutation.isPending}
                        onClick={() => restoreMutation.mutate(item.id)}
                      >
                        <RotateCcw /> {ar ? "استعادة" : "Restore"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}