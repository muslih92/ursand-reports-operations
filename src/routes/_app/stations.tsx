import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { AdminOnly } from "@/components/admin-only";

export const Route = createFileRoute("/_app/stations")({
  component: () => <AdminOnly><StationsPage /></AdminOnly>,
});

interface Station {
  id: string; code: string; name_en: string; name_ar: string;
  location: string | null; active: boolean;
}

function StationsPage() {
  const { locale, t } = useI18n();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Station> | null>(null);

  const { data: stations, isLoading } = useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stations").select("*").order("code");
      if (error) throw error;
      return data as Station[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (s: Partial<Station>) => {
      const payload = {
        code: s.code!, name_en: s.name_en!, name_ar: s.name_ar!,
        location: s.location ?? null, active: s.active ?? true,
      };
      if (s.id) {
        const { error } = await supabase.from("stations").update(payload).eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(locale === "ar" ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["stations"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(locale === "ar" ? "تم الحذف" : "Deleted"); qc.invalidateQueries({ queryKey: ["stations"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("nav.stations")}</h1>
        {isAdmin && (
          <button onClick={() => setEditing({ active: true })} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90">
            <Plus className="h-4 w-4" /> {t("common.add")}
          </button>
        )}
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-3 font-medium">{locale === "ar" ? "الرمز" : "Code"}</th>
              <th className="text-start px-4 py-3 font-medium">{locale === "ar" ? "الاسم" : "Name"}</th>
              <th className="text-start px-4 py-3 font-medium">{locale === "ar" ? "الموقع" : "Location"}</th>
              <th className="text-start px-4 py-3 font-medium">{t("common.status")}</th>
              {isAdmin && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">{t("common.loading")}</td></tr>
            ) : !stations?.length ? (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">{locale === "ar" ? "لا توجد محطات" : "No stations"}</td></tr>
            ) : stations.map((s) => (
              <tr key={s.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{s.code}</td>
                <td className="px-4 py-3 font-medium">{locale === "ar" ? s.name_ar : s.name_en}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.location}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs ${s.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    {s.active ? (locale === "ar" ? "نشط" : "Active") : (locale === "ar" ? "معطّل" : "Inactive")}
                  </span>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-end">
                    <div className="inline-flex gap-1">
                      <button onClick={() => setEditing(s)} className="p-1.5 hover:bg-accent rounded"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => confirm(locale === "ar" ? "حذف؟" : "Delete?") && del.mutate(s.id)} className="p-1.5 hover:bg-destructive/10 text-destructive rounded"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <form onSubmit={(e) => { e.preventDefault(); upsert.mutate(editing); }} className="space-y-4">
            <h2 className="text-lg font-bold">{editing.id ? t("common.edit") : t("common.add")}</h2>
            <Input label={locale === "ar" ? "الرمز" : "Code"} value={editing.code ?? ""} onChange={(v) => setEditing({ ...editing, code: v })} required />
            <Input label={locale === "ar" ? "الاسم بالعربي" : "Name (AR)"} value={editing.name_ar ?? ""} onChange={(v) => setEditing({ ...editing, name_ar: v })} required />
            <Input label={locale === "ar" ? "الاسم بالإنجليزي" : "Name (EN)"} value={editing.name_en ?? ""} onChange={(v) => setEditing({ ...editing, name_en: v })} required />
            <Input label={locale === "ar" ? "الموقع" : "Location"} value={editing.location ?? ""} onChange={(v) => setEditing({ ...editing, location: v })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              {locale === "ar" ? "نشط" : "Active"}
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border hover:bg-accent">{t("common.cancel")}</button>
              <button type="submit" disabled={upsert.isPending} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">{t("common.save")}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Input({ label, value, onChange, type = "text", required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
    </label>
  );
}
