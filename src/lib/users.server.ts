import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export async function tryAdmin() {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] || !process.env["SUPABASE_URL"]) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    return null;
  }
}

export async function publicClient() {
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Backend is not configured on this server");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

export async function assertAdmin(ctx: { supabase: SupabaseClient; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin only");
}

export function employeeEmail(employeeNo: string) {
  return `emp${employeeNo.trim()}@wtco.local`;
}

/**
 * First-admin setup is only allowed on a genuinely new installation:
 * no persistent installation marker, no admin role, no profile and no auth user.
 * Any lookup failure is treated as "already initialized" (fail closed).
 */
export async function isInstallationUninitialized(admin: SupabaseClient): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;
    const marker = await db.from("app_installation").select("id", { count: "exact", head: true });
    if (marker.error || (marker.count ?? 0) > 0) return false;
    const admins = await admin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
    if (admins.error || (admins.count ?? 0) > 0) return false;
    const profiles = await admin.from("profiles").select("*", { count: "exact", head: true });
    if (profiles.error || (profiles.count ?? 0) > 0) return false;
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (users.error || (users.data?.users?.length ?? 0) > 0) return false;
    return true;
  } catch {
    return false;
  }
}

export async function markInstallationInitialized(admin: SupabaseClient, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("app_installation")
    .upsert({ id: true, initialized_by: userId }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}