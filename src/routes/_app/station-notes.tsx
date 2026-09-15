import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { useScopedStations, useStationScope } from "@/lib/station-scope";
import { toast } from "sonner";
import { AlertOctagon, AlertTriangle, Info, Plus, CheckCircle2, Trash2, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_app/station-notes")({
  head: () => ({
    meta: [
      { title: "Station Notes & Reports | WTCO" },
      {
        name: "description",
        content:
          "Internal station channel for isolation alerts, warnings and notes, visible only to the station supervisor and its operators.",
      },
      { property: "og:title", content: "Station Notes & Reports" },
      {
        property: "og:description",
        content: "Log isolations, warnings and notes inside your own station and follow them until closed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StationNotesPage,
});

type Category = "isolation" | "warning" | "note";

interface Note {
  id: string;
  station_id: string;
  category: Category;
  title: string;
  body: string | null;
  status: "open" | "closed";
  author_id: string | null;
  author_name: string | null;
  author_role: string | null;
  closed_at: string | null;
  created_at: string;
}

const sb = supabase as unknown as { from: (t: string) => any };

const CAT = {
  isolation: {
    ar: "عزل",
    en: "Isolation",
    icon: AlertOctagon,
    card: "border-destructive/50 bg-destructive/10",
    chip: "bg-destructive text-destructive-foreground",
  },
  warning: {
    ar: "تحذير",
    en: "Warning",
    icon: AlertTriangle,
    card: "border-warning/50 bg-warning/10",
    chip: "bg-warning text-warning-foreground",
  },
  note: {
    ar: "ملاحظة",
    en: "Note",
    icon: Info,
    card: "border-border bg-card",
    chip: "bg-muted text-muted-foreground",
  },
} as const;

function StationNotesPage() {
  const { locale, dir } = useI18n();
  const ar = locale === "ar";
  const { profile, user, isAdmin, hasRole } = useAuth();
  const { data: stations = [] } = useScopedStations();
  const { scopedStationId, canPickStation } = useStationScope();
  const qc = useQueryClient();

  const canClose = isAdmin || hasRole("supervisor");
  const [stationId, setStationId] = useState<string>(scopedStationId ?? "");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [form, setForm] = useState<{ category: Category; title: string; body: string } | null>(null);

  useEffect(() => {
    if (!stationId && stations.length) setStationId(scopedStationId ?? stations[0]!.id);
  }, [stations, scopedStationId, stationId]);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["station-notes", stationId, filter],
    enabled: !!stationId,
    refetchInterval: 30000,
    queryFn: async () => {
      let q = sb
        .from("station_notes")
        .select("*")
        .eq("station_id", stationId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (filter === "open") q = q.eq("status", "open");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });

  const counts = useMemo(() => {
    const open = notes.filter((n) => n.status === "open");
    return {
      isolation: open.filter((n) => n.category === "isolation").length,
      warning: open.filter((n) => n.category === "warning").length,
      note: open.filter((n) => n.category === "note").length,
    };
  }, [notes]);

  const create = useMutation({
    mutationFn: async (f: { category: Category; title: string; body: string }) => {
      const { error } = await sb.from("station_notes").insert({
        station_id: stationId,
        category: f.category,
        title: f.title.trim(),
        body: f.body.trim() || null,
        author_id: user?.id ?? null,
        author_name: profile?.full_name ?? null,
        author_role: isAdmin ? "admin" : hasRole("supervisor") ? "supervisor" : "operator",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(ar ? "تم التسجيل" : "Saved");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["station-notes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "open" | "closed" }) => {
      const { error } = await sb
        .from("station_notes")
        .update({ status, closed_at: status === "closed" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["station-notes"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("station_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["station-notes"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5" dir={dir}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{ar ? "بلاغات وملاحظات المحطة" : "Station Notes & Reports"}</h1>
          <p className="text-sm text-muted-foreground">
            {ar
              ? "قناة داخلية تظهر فقط لمشرف المحطة ومشغليها"
              : "Internal channel visible only to this station's supervisor and operators"}
          </p>
        </div>
        <button
          onClick={() => setForm({ category: "note", title: "", body: "" })}
          disabled={!stationId}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {ar ? "بلاغ جديد" : "New entry"}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <label className="block min-w-[14rem]">
          <span className="text-sm font-medium">{ar ? "المحطة" : "Station"}</span>
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            disabled={!canPickStation}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-70"
          >
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {ar ? s.name_ar : s.name_en}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[10rem]">
          <span className="text-sm font-medium">{ar ? "العرض" : "Show"}</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "open" | "all")}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="open">{ar ? "المفتوحة" : "Open"}</option>
            <option value="all">{ar ? "الكل" : "All"}</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-destructive px-3 py-1 text-destructive-foreground">
            {ar ? "عزل" : "Isolation"}: {counts.isolation}
          </span>
          <span className="rounded-full bg-warning px-3 py-1 text-warning-foreground">
            {ar ? "تحذير" : "Warning"}: {counts.warning}
          </span>
          <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
            {ar ? "ملاحظة" : "Note"}: {counts.note}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground">{ar ? "جارٍ التحميل..." : "Loading..."}</div>
      ) : !notes.length ? (
        <div className="rounded-xl border bg-card py-12 text-center text-muted-foreground">
          {ar ? "لا توجد بلاغات" : "No entries"}
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => {
            const c = CAT[n.category] ?? CAT.note;
            const Icon = c.icon;
            const mine = n.author_id === user?.id;
            return (
              <div
                key={n.id}
                className={`rounded-xl border p-4 ${c.card} ${n.status === "closed" ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.chip}`}>
                        {ar ? c.ar : c.en}
                      </span>
                      {n.status === "closed" && (
                        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-bold text-success">
                          {ar ? "مغلق" : "Closed"}
                        </span>
                      )}
                      <span className="font-semibold">{n.title}</span>
                    </div>
                    {n.body && <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>}
                    <div className="mt-2 text-xs text-muted-foreground">
                      {n.author_name ?? "—"} · {new Date(n.created_at).toLocaleString(ar ? "ar-SA" : "en-GB")}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {(canClose || mine) &&
                      (n.status === "open" ? (
                        <button
                          onClick={() => setStatus.mutate({ id: n.id, status: "closed" })}
                          title={ar ? "إغلاق" : "Close"}
                          className="rounded p-1.5 hover:bg-accent"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setStatus.mutate({ id: n.id, status: "open" })}
                          title={ar ? "إعادة فتح" : "Reopen"}
                          className="rounded p-1.5 hover:bg-accent"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      ))}
                    {isAdmin && (
                      <button
                        onClick={() => confirm(ar ? "حذف؟" : "Delete?") && remove.mutate(n.id)}
                        className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir={dir}>
          <div className="w-full max-w-lg rounded-xl bg-card p-5 shadow-lg">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.title.trim()) return;
                create.mutate(form);
              }}
              className="space-y-3"
            >
              <h2 className="text-lg font-bold">{ar ? "بلاغ جديد" : "New entry"}</h2>
              <div className="grid grid-cols-3 gap-2">
                {(["isolation", "warning", "note"] as Category[]).map((k) => {
                  const c = CAT[k];
                  const active = form.category === k;
                  return (
                    <button
                      type="button"
                      key={k}
                      onClick={() => setForm({ ...form, category: k })}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${c.card} ${
                        active ? "ring-2 ring-primary" : ""
                      }`}
                    >
                      {ar ? c.ar : c.en}
                    </button>
                  );
                })}
              </div>
              <label className="block">
                <span className="text-sm font-medium">{ar ? "العنوان" : "Title"}</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">{ar ? "التفاصيل" : "Details"}</span>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="rounded-lg border px-4 py-2 hover:bg-accent"
                >
                  {ar ? "إلغاء" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={create.isPending}
                  className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {ar ? "حفظ" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
