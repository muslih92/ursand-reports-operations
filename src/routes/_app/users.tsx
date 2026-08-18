import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createUser, listUsers, updateUser, deleteUser } from "@/lib/users.functions";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Modal, Input } from "./stations";
import { AdminOnly } from "@/components/admin-only";

type Role = "admin" | "supervisor" | "operator" | "management" | "viewer";
interface EditUser {
  id?: string; employee_no?: string; full_name?: string; password?: string;
  role?: Role; station_id?: string | null; phone?: string | null; active?: boolean;
}

export const Route = createFileRoute("/_app/users")({
  component: () => <AdminOnly><UsersPage /></AdminOnly>,
});

function UsersPage() {
  const { locale, t } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<EditUser | null>(null);

  const list = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const update = useServerFn(updateUser);
  const del = useServerFn(deleteUser);

  const { data: users, isLoading, error } = useQuery({ queryKey: ["users"], queryFn: () => list(), retry: false });
  const { data: stations } = useQuery({
    queryKey: ["stations-lookup"],
    queryFn: async () => (await supabase.from("stations").select("id, code, name_ar, name_en").order("code")).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (u: EditUser) => {
      if (u.id) {
        await update({ data: {
          id: u.id, full_name: u.full_name, station_id: u.station_id ?? null,
          phone: u.phone ?? null, active: u.active, role: u.role,
          new_password: u.password || null,
        } });
      } else {
        await create({ data: {
          employee_no: u.employee_no!, full_name: u.full_name!, password: u.password!,
          role: u.role ?? "operator", station_id: u.station_id ?? null, phone: u.phone ?? null,
        } });
      }
    },
    onSuccess: () => { toast.success(locale === "ar" ? "تم الحفظ" : "Saved"); qc.invalidateQueries({ queryKey: ["users"] }); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success(locale === "ar" ? "تم الحذف" : "Deleted"); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const stationRequired = !!editing && (editing.role ?? "operator") !== "admin" && editing.role !== "management" && editing.role !== "viewer";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("nav.users")}</h1>
        <button onClick={() => setEditing({ role: "operator", active: true })} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90">
          <Plus className="h-4 w-4" /> {t("common.add")}
        </button>
      </div>

      <div className="bg-card rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-start px-4 py-3 font-medium">#</th>
              <th className="text-start px-4 py-3 font-medium">{locale === "ar" ? "الاسم" : "Name"}</th>
              <th className="text-start px-4 py-3 font-medium">{locale === "ar" ? "الدور" : "Role"}</th>
              <th className="text-start px-4 py-3 font-medium">{t("common.station")}</th>
              <th className="text-start px-4 py-3 font-medium">{t("common.status")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">{t("common.loading")}</td></tr>
            ) : error ? (
              <tr><td colSpan={6} className="text-center py-8 text-destructive">{(error as Error).message}</td></tr>
            ) : !users?.length ? (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">{locale === "ar" ? "لا يوجد" : "None"}</td></tr>
            ) : users.map((u) => {
              const st = stations?.find((s) => s.id === u.station_id);
              return (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono">{u.employee_no}</td>
                  <td className="px-4 py-3 font-medium">{u.full_name}</td>
                  <td className="px-4 py-3">{t(`role.${u.role}`)}</td>
                  <td className="px-4 py-3">{st ? (locale === "ar" ? st.name_ar : st.name_en) : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${u.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                      {u.active ? (locale === "ar" ? "نشط" : "Active") : (locale === "ar" ? "معطّل" : "Disabled")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="inline-flex gap-1">
                      <button onClick={() => setEditing({ ...u, role: u.role as Role, password: "" })} className="p-1.5 hover:bg-accent rounded"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => confirm(locale === "ar" ? "حذف؟" : "Delete?") && remove.mutate(u.id)} className="p-1.5 hover:bg-destructive/10 text-destructive rounded"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }} className="space-y-3">
            <h2 className="text-lg font-bold">{editing.id ? t("common.edit") : t("common.add")}</h2>
            {!editing.id && (
              <Input label={t("auth.employee_no")} value={editing.employee_no ?? ""} onChange={(v) => setEditing({ ...editing, employee_no: v })} required />
            )}
            <Input label={locale === "ar" ? "الاسم الكامل" : "Full Name"} value={editing.full_name ?? ""} onChange={(v) => setEditing({ ...editing, full_name: v })} required />
            <Input label={editing.id ? (locale === "ar" ? "كلمة سر جديدة (اختياري)" : "New password (optional)") : t("auth.password")} value={editing.password ?? ""} onChange={(v) => setEditing({ ...editing, password: v })} type="password" required={!editing.id} />
            <label className="block">
              <span className="text-sm font-medium">{locale === "ar" ? "الدور" : "Role"}</span>
              <select value={editing.role ?? "operator"} onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="admin">{t("role.admin")}</option>
                <option value="supervisor">{t("role.supervisor")}</option>
                <option value="operator">{t("role.operator")}</option>
                <option value="management">{t("role.management")}</option>
                <option value="viewer">{t("role.viewer")}</option>

              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">
                {t("common.station")}
                {stationRequired && <span className="text-destructive"> *</span>}
              </span>
              <select
                value={editing.station_id ?? ""}
                onChange={(e) => setEditing({ ...editing, station_id: e.target.value || null })}
                required={stationRequired}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {stations?.map((s) => <option key={s.id} value={s.id}>{locale === "ar" ? s.name_ar : s.name_en}</option>)}
              </select>
              {stationRequired && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {locale === "ar"
                    ? "الموظف سيرى ويعمل داخل هذه المحطة فقط"
                    : "This user will only see and work within this station"}
                </span>
              )}
            </label>
            <Input label={locale === "ar" ? "الهاتف" : "Phone"} value={editing.phone ?? ""} onChange={(v) => setEditing({ ...editing, phone: v })} />
            {editing.id && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                {locale === "ar" ? "نشط" : "Active"}
              </label>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border hover:bg-accent">{t("common.cancel")}</button>
              <button type="submit" disabled={save.isPending} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">{t("common.save")}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
