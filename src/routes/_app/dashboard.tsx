import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, ClipboardList, AlertTriangle, Activity } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { profile } = useAuth();
  const { t, locale } = useI18n();
  const today = new Date().toISOString().slice(0, 10);

  const { data: stats } = useQuery({
    queryKey: ["dash-stats", today],
    queryFn: async () => {
      const [stationsRes, entriesRes, incidentsRes] = await Promise.all([
        supabase.from("stations").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("reading_entries").select("id", { count: "exact", head: true }).eq("entry_date", today),
        supabase.from("incidents").select("id", { count: "exact", head: true }).eq("status", "open"),
      ]);
      return {
        stations: stationsRes.count ?? 0,
        readings: entriesRes.count ?? 0,
        openIncidents: incidentsRes.count ?? 0,
      };
    },
  });

  const { data: recentIncidents } = useQuery({
    queryKey: ["recent-incidents"],
    queryFn: async () => {
      const { data } = await supabase
        .from("incidents")
        .select("id, title, severity, status, occurred_at, equipment, stations(name_ar, name_en)")
        .order("occurred_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("dash.welcome")} {profile?.full_name}</h1>
        <p className="text-sm text-muted-foreground">{t("dash.title")} · {new Date().toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={ClipboardList} label={t("dash.today_readings")} value={stats?.readings ?? 0} color="primary" />
        <StatCard icon={AlertTriangle} label={t("dash.open_incidents")} value={stats?.openIncidents ?? 0} color="destructive" />
        <StatCard icon={Building2} label={t("dash.stations_active")} value={stats?.stations ?? 0} color="success" />
      </div>

      <div className="bg-card rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> {t("dash.recent_incidents")}</h2>
          <Link to="/incidents" className="text-sm text-primary hover:underline">{locale === "ar" ? "عرض الكل" : "View all"}</Link>
        </div>
        {!recentIncidents || recentIncidents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{locale === "ar" ? "لا توجد حوادث" : "No incidents"}</p>
        ) : (
          <ul className="divide-y">
            {recentIncidents.map((inc) => (
              <li key={inc.id} className="py-3 flex items-center gap-3">
                <span className={`inline-block h-2 w-2 rounded-full ${severityColor(inc.severity)}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{inc.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {inc.equipment} · {inc.stations ? (locale === "ar" ? inc.stations.name_ar : inc.stations.name_en) : ""}
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-muted">{inc.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function severityColor(s: string) {
  if (s === "critical") return "bg-destructive";
  if (s === "high") return "bg-orange-500";
  if (s === "medium") return "bg-yellow-500";
  return "bg-muted-foreground";
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; color: string }) {
  return (
    <div className="bg-card rounded-xl border p-5 flex items-center gap-4">
      <div className={`h-12 w-12 rounded-lg flex items-center justify-center bg-${color}/10 text-${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
