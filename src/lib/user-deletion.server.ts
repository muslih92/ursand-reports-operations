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
  ["station_messages", "author_id"], ["station_notes", "author_id"],
  ["supervisor_routines", "created_by"], ["supervisor_routines", "supervisor_id"],
];

export type DeletionResult = { ok: boolean; code: string; message: string; can_deactivate?: boolean };
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
  const identity = await admin.auth.admin.getUserById(target);
  if (identity.error || !identity.data.user) return result(404, { ok: false, code: "NOT_FOUND", message: "تعذر العثور على الحساب والتحقق منه" });

  if (action === "deactivate") {
    // Revoke the ability to sign in before changing the profile; never delete history.
    const banned = await admin.auth.admin.updateUserById(target, { ban_duration: "876000h" });
    if (banned.error) return result(503, { ok: false, code: "DEACTIVATION_FAILED", message: "تعذر تعطيل تسجيل الدخول" });
    const profile = await admin.from("profiles").update({ active: false }).eq("id", target).select("id");
    if (profile.error || !profile.data?.length) return result(503, { ok: false, code: "PROFILE_UPDATE_FAILED", message: "تم منع تسجيل الدخول، لكن تعذر تحديث حالة الحساب؛ راجع المسؤول" });
    return result(200, { ok: true, code: "DEACTIVATED", message: "تم تعطيل الحساب مع الاحتفاظ بسجلاته" });
  }

  for (const [table, column] of historicalReferences) {
    const reference = await admin.from(table).select(column, { count: "exact", head: true }).eq(column, target);
    if (reference.error || reference.count === null) return result(503, { ok: false, code: "INTEGRITY_CHECK_FAILED", message: "تعذر التحقق من السجلات المرتبطة؛ لم يتم الحذف" });
    if (reference.count > 0) return result(409, { ok: false, code: "HISTORICAL_REFERENCES", message: "لا يمكن حذف الحساب لارتباطه بسجلات محفوظة؛ يمكنك تعطيله بدلاً من الحذف", can_deactivate: true });
  }
  // Auth removes only identity/profile/role/assignment rows. No manual operational deletes.
  const deleted = await admin.auth.admin.deleteUser(target);
  if (deleted.error) return result(409, { ok: false, code: "DELETE_RESTRICTED", message: "تعذر الحذف الآمن؛ يمكنك تعطيل الحساب بدلاً منه", can_deactivate: true });
  return result(200, { ok: true, code: "DELETED", message: "تم حذف الحساب" });
}