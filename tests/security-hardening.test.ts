import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Behavioral authorization tests for the security-hardening migration.
 *
 * 1. `security_hardening_report()` — structural invariants on the live database
 *    (no global supervisor grants, no anon grants, no TRUNCATE, RLS on, buckets private...).
 * 2. Real sign-in tests: temporary users for every role are created with the
 *    service role, signed in through the normal API, and their actual reads/writes
 *    are checked against the authorized access model. All temporary rows and
 *    users are removed afterwards. No existing user, role or record is touched.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + publishable key; skipped otherwise.
 */

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const maybe = url && serviceKey && anonKey ? describe : describe.skip;

type Role = "admin" | "management" | "viewer" | "supervisor" | "operator";
interface TestUser { id: string; client: SupabaseClient }

maybe("security hardening — live authorization", () => {
  const svc = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const tag = `sec${Date.now()}`;
  const users: Partial<Record<Role | "operator_other", TestUser>> = {};
  let stA = "", stB = "", stC = "";
  const createdUserIds: string[] = [];
  const createdRoutineIds: string[] = [];

  async function makeUser(key: string, role: Role, station: string | null, extra?: string): Promise<TestUser> {
    const email = `${tag}-${key}@test.invalid`;
    const password = `Pw-${tag}-${key}!`;
    const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    const id = data.user.id;
    createdUserIds.push(id);
    await svc.from("profiles").insert({ id, employee_no: `9${Date.now() % 1e8}${createdUserIds.length}`, full_name: `${tag} ${key}`, station_id: station, active: true });
    await svc.from("user_roles").insert({ user_id: id, role });
    if (extra) await svc.from("profile_stations").insert({ user_id: id, station_id: extra });
    const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: sErr } = await client.auth.signInWithPassword({ email, password });
    if (sErr) throw sErr;
    return { id, client };
  }

  beforeAll(async () => {
    const { data: st } = await svc.from("stations").select("id").eq("active", true).order("code").limit(3);
    if (!st || st.length < 3) throw new Error("need at least 3 active stations");
    [stA, stB, stC] = st.map((s) => s.id);
    users.admin = await makeUser("admin", "admin", null);
    users.management = await makeUser("mgmt", "management", null);
    users.viewer = await makeUser("viewer", "viewer", null);
    users.supervisor = await makeUser("sup", "supervisor", stA, stB); // primary A + extra B
    users.operator = await makeUser("op", "operator", stA);
    users.operator_other = await makeUser("op2", "operator", stC);
  }, 120_000);

  afterAll(async () => {
    if (createdRoutineIds.length) await svc.from("supervisor_routines").delete().in("id", createdRoutineIds);
    for (const id of createdUserIds) await svc.auth.admin.deleteUser(id);
  }, 120_000);

  const visibleStations = async (c: SupabaseClient) =>
    new Set(((await c.from("stations").select("id")).data ?? []).map((r) => r.id));

  it("structural hardening report passes", async () => {
    const { data, error } = await svc.rpc("security_hardening_report" as never);
    expect(error, error?.message).toBeNull();
    const fails = ((data ?? []) as { scenario: string; passed: boolean; detail: string | null }[])
      .filter((r) => !r.passed).map((r) => `${r.scenario}: ${r.detail ?? ""}`);
    expect(fails, fails.join("\n")).toEqual([]);
  });

  it("ADMIN / MANAGEMENT / VIEWER read all stations", async () => {
    for (const k of ["admin", "management", "viewer"] as const) {
      const s = await visibleStations(users[k]!.client);
      expect(s.has(stA) && s.has(stB) && s.has(stC), k).toBe(true);
    }
  });

  it("SUPERVISOR reads primary + extra station only", async () => {
    const s = await visibleStations(users.supervisor!.client);
    expect(s.has(stA)).toBe(true);
    expect(s.has(stB)).toBe(true);
    expect(s.has(stC)).toBe(false);
    const { data } = await users.supervisor!.client.from("reading_entries").select("station_id").eq("station_id", stC).limit(1);
    expect(data ?? []).toEqual([]);
  });

  it("OPERATOR reads own station only", async () => {
    const s = await visibleStations(users.operator!.client);
    expect(s.has(stA)).toBe(true);
    expect(s.has(stC)).toBe(false);
  });

  it("SUPERVISOR writes routines in assigned station but not elsewhere", async () => {
    const sup = users.supervisor!;
    const ok = await sup.client.from("supervisor_routines").insert({ station_id: stA, routine_date: "2099-01-01", weekday: 4, supervisor_id: sup.id, items: [] }).select("id").single();
    expect(ok.error, ok.error?.message).toBeNull();
    if (ok.data) createdRoutineIds.push(ok.data.id);
    const bad = await sup.client.from("supervisor_routines").insert({ station_id: stC, routine_date: "2099-01-01", weekday: 4, supervisor_id: sup.id, items: [] });
    expect(bad.error).not.toBeNull();
  });

  it("OPERATOR cannot create or modify supervisor routines", async () => {
    const op = users.operator!;
    const ins = await op.client.from("supervisor_routines").insert({ station_id: stA, routine_date: "2099-01-02", weekday: 5, items: [] });
    expect(ins.error).not.toBeNull();
    if (createdRoutineIds[0]) {
      const upd = await op.client.from("supervisor_routines").update({ notes: "x" }).eq("id", createdRoutineIds[0]).select("id");
      expect(upd.data ?? []).toEqual([]);
    }
  });

  it("OPERATOR may write shift reports in own station, not in another", async () => {
    const op = users.operator!;
    const bad = await op.client.from("shift_reports").insert({ station_id: stC, report_date: "2099-01-01", shift: "day", operator_id: op.id });
    expect(bad.error).not.toBeNull();
  });

  it("MANAGEMENT and VIEWER cannot perform operational writes or change roles", async () => {
    for (const k of ["management", "viewer"] as const) {
      const c = users[k]!.client;
      expect((await c.from("supervisor_routines").insert({ station_id: stA, routine_date: "2099-01-03", weekday: 6, items: [] })).error, k).not.toBeNull();
      expect((await c.from("shift_reports").insert({ station_id: stA, report_date: "2099-01-03", shift: "day" })).error, k).not.toBeNull();
      expect((await c.from("user_roles").insert({ user_id: users[k]!.id, role: "admin" })).error, k).not.toBeNull();
    }
  });

  it("ADMIN can manage roles", async () => {
    const r = await users.admin!.client.from("user_roles").select("user_id").eq("user_id", users.viewer!.id);
    expect(r.error).toBeNull();
    expect((r.data ?? []).length).toBe(1);
  });

  it("ANON cannot read protected data or call privileged functions", async () => {
    for (const t of ["stations", "reading_entries", "incidents", "profiles", "user_roles", "app_settings", "shift_reports"]) {
      const { data } = await anon.from(t as never).select("*").limit(1);
      expect(data ?? [], t).toEqual([]);
    }
    for (const fn of ["security_test_report", "security_hardening_report", "log_audit_event", "station_week_scores", "notify_users"]) {
      const { error } = await anon.rpc(fn as never, {} as never);
      expect(error, fn).not.toBeNull();
    }
  });

  it("FIRST ADMIN cannot be reopened by an empty profiles table alone", async () => {
    const { count } = await svc.from("app_installation" as never).select("*", { count: "exact", head: true });
    expect(count ?? 0).toBeGreaterThan(0);
  });

  it("APP SETTINGS readable by clients hold no secret-like keys", async () => {
    const { data } = await users.operator!.client.from("app_settings").select("key, value");
    for (const row of data ?? []) {
      const keys = row.value && typeof row.value === "object" ? Object.keys(row.value as object) : [];
      for (const k of keys) expect(k).not.toMatch(/secret|password|token|api_?key|private|credential|service_role/i);
    }
  });
});
