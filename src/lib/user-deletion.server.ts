import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const deletionInput = z.object({
  user_id: z.string().uuid(),
  action: z.enum(["delete", "deactivate"]).default("delete"),
}).strict();

// Includes references without foreign keys: preserve attribution, not just rows.
export const historicalReferences: ReadonlyArray<readonly [string, string]> = [
  ["app_installation", "initialized_by"], ["audit_events", "actor_id"],
  ["checklist_entries", "operator_id"], ["checklist_reports", "operator_id"],
  ["defeat_records", "created_by"], ["deleted_items", "deleted_by"], ["deleted_items", "restored_by"],
  ["equipment_availability_entries", "operator_id"], ["equipment_availability_entries", "supervisor_id"],
  ["fire_pump_tests", "created_by"], ["fire_pump_tests", "operator_id"],
  ["generator_tests", "created_by"], ["generator_tests", "operator_id"],
  ["incident_attachments", "uploaded_by"], ["incidents", "reported_by"],
  ["notifications", "user_id"], ["reading_entries", "operator_id"],
  ["scada_samples", "recorded_by"], ["shift_reports", "operator_id"],
  ["station_messages", "author_id"], ["station_messages", "target_user_ids"], ["station_notes", "author_id"],
  ["supervisor_routines", "created_by"], ["supervisor_routines", "supervisor_id"],
];

export type DeletionResult = { ok: boolean; code: string; message: string; can_deactivate?: boolean; retryable?: boolean };
const result = (status: number, body: DeletionResult) => ({ status, body });

export async function manageUserDeletion(
  caller: { supabase: SupabaseClient; userId: string },
  input: unknown,
  getAdmin: () => Promise<SupabaseClient | null>,
) {
  const parsed = deletionInput.safeParse(input);
  if (!parsed.success) return result(400, { ok: false, code: "INVALID_INPUT", message: "معرّف المستخدم أو الطلب غير صالح" });
  const { data: isAdmin, error: roleError } = await caller.supabase.rpc("has_role", { _user_id: caller.userId, _role: "admin" });
  if (roleError || isAdmin !== true) return result(403, { ok: false, code: "FORBIDDEN", message: "هذه العملية للمسؤول فقط" });
  const { user_id: target, action } = parsed.data;
  if (target === caller.userId) return result(409, { ok: false, code: "SELF_DELETE", message: "لا يمكن حذف أو تعطيل حسابك الحالي" });
  const admin = await getAdmin();
  if (!admin) return result(503, { ok: false, code: "UNAVAILABLE", message: "خدمة إدارة الحسابات غير متاحة، لم يتغير شيء" });
  // This RPC is intentionally unavailable until the reviewed schema is installed.
  // Reservation + last-admin check + relation readiness are one DB transaction.
  const db = admin as unknown as { rpc: (name: string, args: Record<string, string>) => Promise<{ data: unknown; error: { message?: string } | null }> };
  const args = { _actor: caller.userId, _target: target, _action: action };
  const pending = () => result(503, { ok: false, code: "RECOVERY_REQUIRED", retryable: true, message: "لم تكتمل العملية؛ قد يكون الحساب معطلاً. أعد الطلب نفسه لاستكماله بأمان" });
  try {
    const prepared = await db.rpc("prepare_user_deletion", args);
    if (prepared.error) {
      const code = ["LAST_ACTIVE_ADMIN", "FORBIDDEN", "SELF_DELETE", "NOT_FOUND", "ACTION_CONFLICT"].find(c => prepared.error?.message?.includes(c));
      if (code) return result(code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 409, {
        ok: false, code, message: code === "LAST_ACTIVE_ADMIN" ? "لا يمكن إزالة أو تعطيل آخر مسؤول فعّال" : "لم يُنفذ الطلب؛ راجع صلاحية الحساب وحالة العملية",
      });
      return result(503, { ok: false, code: "SCHEMA_NOT_READY", message: "الحذف غير مفعّل: يلزم اعتماد تجهيز الهوية التاريخية والعلاقات أولاً" });
    }
    const ready = z.object({ state: z.enum(["prepared", "completed"]), protected_relations: z.literal(6) }).safeParse(prepared.data);
    if (!ready.success) return pending();
    if (ready.data.state === "prepared") {
      const identity = await admin.auth.admin.getUserById(target);
      const absent = identity.error?.code === "user_not_found" || (!identity.error && !identity.data.user);
      if (identity.error && !absent) return pending();
      if (action === "delete" && !absent) {
        const banned = await admin.auth.admin.updateUserById(target, { ban_duration: "876000h" });
        if (banned.error) return pending();
        const deleted = await admin.auth.admin.deleteUser(target);
        // Even if Auth succeeded but its response was lost, retry can resume.
        if (deleted.error) return pending();
      } else if (action === "deactivate") {
        if (absent) return pending();
        const banned = await admin.auth.admin.updateUserById(target, { ban_duration: "876000h" });
        if (banned.error) return pending();
      }
    }
    // Authoritative DB confirmation checks auth.users (not a guessed 404),
    // and persists completion/audit before reporting success, including retries.
    const confirmed = await db.rpc("complete_user_deletion", args);
    if (confirmed.error || confirmed.data !== true) return pending();
    return result(200, { ok: true, code: action === "delete" ? "DELETED" : "DEACTIVATED", message: action === "delete" ? "تم حذف حساب تسجيل الدخول مع الاحتفاظ بجميع السجلات وهويته التاريخية" : "تم تعطيل الحساب مع الاحتفاظ بسجلاته" });
  } catch {
    return pending();
  }
}