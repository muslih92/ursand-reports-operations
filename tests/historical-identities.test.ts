import { describe, expect, it } from "vitest";
import { attributionName, listAttributionPeople } from "@/lib/historical-identities";
import type { SupabaseClient } from "@supabase/supabase-js";
const id = "10000000-0000-4000-8000-000000000002";
describe("historical attribution", () => {
  it("preserves operation-time names even if the stored identity name differs", () => {
    expect(attributionName(id, [{ id, full_name: "Later name", employee_no: "42" }], "Original name")).toBe("Original name");
  });
  it("uses retained name and employee number after login/profile deletion", () => {
    expect(attributionName(id, [{ id, full_name: "Historical name", employee_no: "42" }])).toBe("Historical name #42");
  });
  it.each([false, undefined])("uses history with inactive/missing profile %s", async active => {
    const db = { from: (table: string) => ({ select: async () => ({ data: table === "profiles" ? active === undefined ? [] : [{ id, full_name: "Current", employee_no: "42", active }] : [{ id, full_name: "Original", employee_no: "42" }], error: null }) }) } as unknown as SupabaseClient;
    expect(attributionName(id, await listAttributionPeople(db))).toBe("Original #42");
  });
  it("never invents names for unknown historical UUIDs", () => {
    expect(attributionName(id, [{ id, full_name: null, employee_no: null }])).toBe(id.slice(0,8));
  });
});
