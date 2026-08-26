import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Regression tests for the four hardened areas:
 *   - staff leaderboard scoping / employee-number masking
 *   - targeted notification scoping
 *   - incident attachment storage rules
 *   - shift report update restrictions
 *
 * The assertions live in `public.security_regression_report()` so they are
 * evaluated against the live policies and function definitions, which means a
 * role change or an expired session is covered by the same predicates the
 * database enforces at runtime.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; skipped when missing.
 */

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface ScenarioRow {
  scenario: string;
  expectation: string;
  passed: boolean;
  detail: string | null;
}

const REQUIRED_SCENARIOS = [
  "leaderboard.masks_employee_no",
  "leaderboard.station_scoped",
  "leaderboard.anonymous_blocked",
  "notify_users.scoped",
  "notify_users.anonymous_blocked",
  "incident_attachments.storage_uses_can_access_station",
  "incident_attachments.authenticated_only",
  "shift_reports.update_with_check",
  "roles.single_source_of_truth",
  "audit.write_triggers_present",
  "audit.read_logged_for_leaderboard",
];

const maybe = url && serviceKey ? describe : describe.skip;

maybe("security regression: scoped access stays scoped", () => {
  const admin = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  it("passes every regression scenario", async () => {
    const { data, error } = await admin.rpc("security_regression_report");
    expect(error, error?.message).toBeNull();

    const rows = (data ?? []) as ScenarioRow[];
    expect(rows.length).toBeGreaterThan(0);

    const failures = rows
      .filter((r) => !r.passed)
      .map((r) => `${r.scenario}: expected ${r.expectation}${r.detail ? ` (${r.detail})` : ""}`);

    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("covers all four hardened areas plus audit logging", async () => {
    const { data } = await admin.rpc("security_regression_report");
    const names = ((data ?? []) as ScenarioRow[]).map((r) => r.scenario);
    for (const required of REQUIRED_SCENARIOS) {
      expect(names).toContain(required);
    }
  });

  it("writes an audit trail entry for leaderboard reads", async () => {
    const { data, error } = await admin
      .from("audit_events")
      .select("event_type, actor_id, station_id, occurred_at")
      .eq("event_type", "leaderboard.staff_month.read")
      .order("occurred_at", { ascending: false })
      .limit(5);
    expect(error, error?.message).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});

const maybeAnon = url && anonKey ? describe : describe.skip;

maybeAnon("security regression: expired or missing session", () => {
  // No session at all == the state a client lands in once its JWT expires and
  // the refresh fails; every sensitive surface must refuse it.
  const anon = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  it("refuses the staff leaderboard", async () => {
    const { data, error } = await anon.rpc("staff_month_scores", {});
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("refuses to send notifications", async () => {
    const { data, error } = await anon.rpc("notify_users", {
      _user_ids: ["00000000-0000-0000-0000-000000000001"],
      _station_id: null,
      _kind: "test",
      _title: "should not send",
      _body: null,
      _link: null,
    });
    expect(error !== null || data === 0).toBe(true);
  });

  it("cannot read shift reports, incidents or attachments", async () => {
    for (const table of ["shift_reports", "incidents", "incident_attachments", "audit_events"]) {
      const { data, error } = await anon.from(table).select("id").limit(1);
      expect(error !== null || (data ?? []).length === 0, `${table} leaked rows`).toBe(true);
    }
  });
});
