import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { AdminOnly } from "@/components/admin-only";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_app/audit")({
  component: () => (
    <AdminOnly>
      <AuditPage />
    </AdminOnly>
  ),
  head: () => ({
    meta: [
      { title: "Audit Log — URSAND Operations" },
      {
        name: "description",
        content:
          "Review who accessed or changed operations data, when it happened, and which station it belongs to.",
      },
      { property: "og:title", content: "Audit Log — URSAND Operations" },
      {
        property: "og:description",
        content: "Security audit trail of sensitive reads and writes across all stations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface AuditRow {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  event_type: string;
  entity_table: string | null;
  entity_id: string | null;
  station_id: string | null;
  details: Record<string, unknown> | null;
}

function AuditPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [q, setQ] = useState("");
  const [stationId, setStationId] = useState("");

  const { data: stations } = useQuery({
    queryKey: ["stations-lookup"],
    queryFn: async () =>
      (await supabase.from("stations").select("id, code, name_ar, name_en").order("code")).data ?? [],
  });

  const { data: people } = useQuery({
    queryKey: ["audit-people"],
    queryFn: async () =>
      (await supabase.from("profiles").select("id, full_name, employee_no")).data ?? [],
  });

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["audit-events", stationId],
    queryFn: async () => {
      let query = supabase
        .from("audit_events")
        .select("id, occurred_at, actor_id, event_type, entity_table, entity_id, station_id, details")
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (stationId) query = query.eq("station_id", stationId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const nameOf = (id: string | null) => {
    if (!id) return ar ? "النظام" : "System";
    const p = people?.find((x) => x.id === id);
    return p ? `${p.full_name} #${p.employee_no}` : id.slice(0, 8);
  };
  const stationOf = (id: string | null) => {
    if (!id) return "—";
    const s = stations?.find((x) => x.id === id);
    return s ? `${s.code} · ${ar ? s.name_ar : s.name_en}` : "—";
  };

  const filtered = (rows ?? []).filter((r) => {
    if (!q.trim()) return true;
    const hay = `${r.event_type} ${r.entity_table ?? ""} ${nameOf(r.actor_id)} ${stationOf(r.station_id)}`;
    return hay.toLowerCase().includes(q.trim().toLowerCase());
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="h-6 w-6 text-primary" />
          {ar ? "سجل التدقيق الأمني" : "Security Audit Log"}
        </h1>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={ar ? "بحث..." : "Search..."}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">{ar ? "كل المحطات" : "All stations"}</option>
            {stations?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-start font-medium">{ar ? "الوقت" : "Time"}</th>
              <th className="px-4 py-3 text-start font-medium">{ar ? "المستخدم" : "User"}</th>
              <th className="px-4 py-3 text-start font-medium">{ar ? "الحدث" : "Event"}</th>
              <th className="px-4 py-3 text-start font-medium">{ar ? "السجل" : "Record"}</th>
              <th className="px-4 py-3 text-start font-medium">{ar ? "المحطة" : "Station"}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  {ar ? "جارٍ التحميل..." : "Loading..."}
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-destructive">
                  {(error as Error).message}
                </td>
              </tr>
            ) : !filtered.length ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  {ar ? "لا توجد أحداث" : "No events"}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    {new Date(r.occurred_at).toLocaleString(ar ? "ar-SA" : "en-GB")}
                  </td>
                  <td className="px-4 py-3">{nameOf(r.actor_id)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.event_type}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.entity_table ?? "—"}
                    {r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}
                  </td>
                  <td className="px-4 py-3">{stationOf(r.station_id)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {ar
          ? "يعرض آخر 500 حدث. تُسجَّل عمليات القراءة الحساسة (لوحة المتميزين) وجميع التعديلات على التقارير والحوادث والمرفقات والصلاحيات."
          : "Showing the latest 500 events. Sensitive reads (staff leaderboard) and all changes to reports, incidents, attachments and roles are recorded."}
      </p>
    </div>
  );
}
