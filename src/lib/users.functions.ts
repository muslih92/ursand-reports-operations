import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { empEmail } from "@/lib/utils";

/** Service-role client, or null when the key is not configured (self-hosted). */
async function tryAdmin(): Promise<any | null> {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] || !process.env["SUPABASE_URL"]) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    return null;
  }
}

/** Public (anon) client used as a fallback to sign up new accounts. */
async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Backend is not configured on this server");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

async function assertAdmin(ctx: { supabase: SupabaseClient; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden: admin only");
}

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      employee_no: z.string().min(1).max(32),
      full_name: z.string().min(1).max(120),
      password: z.string().min(6).max(72),
      role: z.enum(["admin", "supervisor", "operator", "management", "viewer"]),
      station_id: z.string().uuid().nullable().optional(),
      phone: z.string().max(32).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if ((data.role === "operator" || data.role === "supervisor") && !data.station_id) {
      throw new Error("Station is required for operator/supervisor users");
    }
    const admin = await tryAdmin();
    const email = empEmail(data.employee_no);
    let userId: string;

    if (admin) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { employee_no: data.employee_no, full_name: data.full_name },
      });
      if (createErr || !created?.user) throw new Error(createErr?.message || "Failed to create user");
      userId = created.user.id;
    } else {
      const pub = await publicClient();
      const { data: signed, error: signErr } = await pub.auth.signUp({
        email,
        password: data.password,
        options: { data: { employee_no: data.employee_no, full_name: data.full_name } },
      });
      if (signErr || !signed?.user) throw new Error(signErr?.message || "Failed to create user");
      userId = signed.user.id;
    }

    const db = admin ?? context.supabase;
    const { error: pErr } = await db.from("profiles").insert({
      id: userId,
      employee_no: data.employee_no,
      full_name: data.full_name,
      station_id: data.station_id ?? null,
      phone: data.phone ?? null,
      active: true,
    });
    if (pErr) {
      if (admin) await admin.auth.admin.deleteUser(userId);
      throw new Error(pErr.message);
    }
    const { error: rErr } = await db.from("user_roles").insert({ user_id: userId, role: data.role });
    if (rErr) throw new Error(rErr.message);

    return { id: userId };
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      full_name: z.string().min(1).max(120).optional(),
      station_id: z.string().uuid().nullable().optional(),
      phone: z.string().max(32).nullable().optional(),
      active: z.boolean().optional(),
      role: z.enum(["admin", "supervisor", "operator", "management", "viewer"]).optional(),
      new_password: z.string().min(6).max(72).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if ((data.role === "operator" || data.role === "supervisor") && data.station_id === null) {
      throw new Error("Station is required for operator/supervisor users");
    }
    const admin = await tryAdmin();
    const db = admin ?? context.supabase;
    const patch: {
      full_name?: string; station_id?: string | null; phone?: string | null; active?: boolean;
    } = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.station_id !== undefined) patch.station_id = data.station_id;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.active !== undefined) patch.active = data.active;
    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("profiles").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    if (data.role) {
      await db.from("user_roles").delete().eq("user_id", data.id);
      const { error } = await db.from("user_roles").insert({ user_id: data.id, role: data.role });
      if (error) throw new Error(error.message);
    }
    if (data.new_password) {
      if (admin) {
        const { error } = await admin.auth.admin.updateUserById(data.id, { password: data.new_password });
        if (error) throw new Error(error.message);
      } else {
        // Self-hosted (no service key): relay the reset to the managed deployment,
        // forwarding the admin's own bearer token so it can re-verify the caller.
        const { getRequest } = await import("@tanstack/react-start/server");
        const authHeader = getRequest()?.headers.get("authorization") ?? "";
        const base =
          process.env["ADMIN_API_BASE"] || "https://ursand-reports-operations.lovable.app";
        const res = await fetch(`${base}/api/public/admin-set-password`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: authHeader },
          body: JSON.stringify({ user_id: data.id, password: data.new_password }),
        });
        if (!res.ok) {
          const raw = (await res.text()).trim();
          const clean = raw.startsWith("<") ? "" : raw.slice(0, 200);
          if (res.status === 404) {
            throw new Error(
              "خدمة إعادة تعيين كلمة السر غير متاحة بعد — يجب نشر (Publish) نسخة Lovable أولاً.",
            );
          }
          if (/weak|easy to guess/i.test(clean)) {
            throw new Error(
              "كلمة السر ضعيفة وسهلة التخمين — اختر كلمة أقوى (أحرف وأرقام ورموز، ٨ خانات فأكثر).",
            );
          }
          throw new Error(`تعذر إعادة تعيين كلمة السر (${res.status})${clean ? `: ${clean}` : ""}`);
        }
      }
    }

    if (admin && data.active === false) {
      await admin.auth.admin.updateUserById(data.id, { ban_duration: "876000h" });
    } else if (admin && data.active === true) {
      await admin.auth.admin.updateUserById(data.id, { ban_duration: "none" });
    }
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin = await tryAdmin();
    if (admin) {
      const { error } = await admin.auth.admin.deleteUser(data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    // No service key: remove app access (profile + role) instead of the auth account.
    await context.supabase.from("user_roles").delete().eq("user_id", data.id);
    const { error } = await context.supabase.from("profiles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    // Read through the caller's RLS-scoped client so listing works even when
    // the service-role key is not configured on a self-hosted deployment.
    const db = context.supabase;
    const { data: profiles, error } = await db
      .from("profiles")
      .select("id, employee_no, full_name, station_id, phone, active, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p) => p.id);
    let roles: { user_id: string; role: string }[] = [];
    if (ids.length > 0) {
      const { data: r } = await db.from("user_roles").select("user_id, role").in("user_id", ids);
      roles = r ?? [];
    }
    return (profiles ?? []).map((p) => ({
      ...p,
      role: roles.find((r) => r.user_id === p.id)?.role ?? "operator",
    }));
  });

export const ensureFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      employee_no: z.string().min(1).max(32),
      full_name: z.string().min(1).max(120),
      password: z.string().min(6).max(72),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Only allowed if no users exist yet
    const { count, error: countErr } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true });
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) throw new Error("System already initialized");

    const email = empEmail(data.employee_no);
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { employee_no: data.employee_no, full_name: data.full_name },
    });
    if (createErr || !created?.user) throw new Error(createErr?.message || "Failed");
    const uid = created.user.id;
    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      id: uid, employee_no: data.employee_no, full_name: data.full_name, active: true,
    });
    if (pErr) throw new Error(pErr.message);
    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "admin" });
    if (rErr) throw new Error(rErr.message);
    return { ok: true };
  });

export const hasAnyAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await tryAdmin();
  if (!admin) return { exists: true };
  const { count, error } = await admin
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin");
  // If the check fails (e.g. database unreachable), never show the initial-setup
  // screen — assume the system is already initialized.
  if (error) return { exists: true };
  return { exists: (count ?? 0) > 0 };
});
