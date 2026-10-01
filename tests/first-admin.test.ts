import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isInstallationUninitialized } from "@/lib/users.server";

/** Fake client returning fixed counts per table and a fixed auth user list. */
function fake(counts: Record<string, number>, authUsers = 0, failTable?: string): SupabaseClient {
  const from = (table: string) => {
    const result = () =>
      failTable === table
        ? { count: null, error: { message: "boom" } }
        : { count: counts[table] ?? 0, error: null };
    const q = {
      select: () => q,
      eq: () => q,
      then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
    };
    return q;
  };
  return {
    from,
    auth: { admin: { listUsers: async () => ({ data: { users: Array(authUsers).fill({}) }, error: null }) } },
  } as unknown as SupabaseClient;
}

describe("first-admin initialization", () => {
  it("fresh installation can initialize", async () => {
    expect(await isInstallationUninitialized(fake({}))).toBe(true);
  });
  it("existing installation (marker present) cannot initialize again", async () => {
    expect(await isInstallationUninitialized(fake({ app_installation: 1 }))).toBe(false);
  });
  it("empty profiles alone does not reopen initialization", async () => {
    expect(await isInstallationUninitialized(fake({ user_roles: 1, profiles: 0 }))).toBe(false);
    expect(await isInstallationUninitialized(fake({ profiles: 0 }, 3))).toBe(false);
  });
  it("fails closed when a lookup errors", async () => {
    expect(await isInstallationUninitialized(fake({}, 0, "app_installation"))).toBe(false);
  });
});
