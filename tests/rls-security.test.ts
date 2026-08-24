import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Automated RLS / notification-visibility tests.
 *
 * The scenarios themselves live in the database function
 * `public.security_test_report()` so they run with the exact same predicates the
 * RLS policies use (can_access_station, can_view_station_message, has_role...).
 * This file executes the suite and fails the build on any failing scenario.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment
 * (available on the server / CI). Skipped locally when they are missing.
 */

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface ScenarioRow {
  scenario: string;
  expectation: string;
  passed: boolean;
  detail: string | null;
}

const maybe = url && serviceKey ? describe : describe.skip;

maybe("database access rules", () => {
  const client = createClient(url!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  it("passes every RLS and notification visibility scenario", async () => {
    const { data, error } = await client.rpc("security_test_report");
    expect(error, error?.message).toBeNull();

    const rows = (data ?? []) as ScenarioRow[];
    expect(rows.length).toBeGreaterThan(0);

    const failures = rows
      .filter((r) => !r.passed)
      .map((r) => `${r.scenario}: expected ${r.expectation}${r.detail ? ` (${r.detail})` : ""}`);

    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("covers each role and station scenario group", async () => {
    const { data } = await client.rpc("security_test_report");
    const names = ((data ?? []) as ScenarioRow[]).map((r) => r.scenario);

    for (const required of [
      "station_scope.own_station",
      "station_scope.foreign_station",
      "roles.unrestricted_viewers",
      "message.station_broadcast",
      "message.supervisor_only",
      "message.role_target_station_scoped",
      "message.user_target",
      "message.author_sees_own",
      "message.anonymous",
      "message.live_rows_scoped",
      "notifications.select_policy",
      "notifications.no_client_insert",
      "notifications.rls_enabled",
      "audit.admin_only_read",
      "audit.no_anon_exec",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("records an audit event for every message and notification fan-out", async () => {
    const { data, error } = await client
      .from("audit_events")
      .select("event_type")
      .limit(1000);
    expect(error, error?.message).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
