import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { historicalReferences, manageUserDeletion } from "@/lib/user-deletion.server";

const callerId = "10000000-0000-4000-8000-000000000001";
const targetId = "10000000-0000-4000-8000-000000000002";
function setup(role = true, history?: string, checkFails = false) {
  const deleteUser = vi.fn(async () => ({ error: null }));
  const updateUserById = vi.fn(async () => ({ error: null }));
  const queried: string[] = [];
  const admin = {
    auth: { admin: { getUserById: async () => ({ data: { user: { id: targetId } }, error: null }), deleteUser, updateUserById } },
    from: (table: string) => ({
      select: () => ({ contains: async (column: string) => {
        queried.push(`${table}.${column}`);
        return { count: checkFails ? null : history === `${table}.${column}` ? 1 : 0, error: checkFails ? {} : null };
      }, eq: async (column: string) => {
        queried.push(`${table}.${column}`);
        return { count: checkFails ? null : history === `${table}.${column}` ? 1 : 0, error: checkFails ? {} : null };
      } }),
      update: () => ({ eq: () => ({ select: async () => ({ data: [{ id: targetId }], error: null }) }) }),
    }),
  } as unknown as SupabaseClient;
  const caller = { userId: callerId, supabase: { rpc: async () => ({ data: role, error: null }) } as unknown as SupabaseClient };
  const getAdmin = vi.fn(async () => admin);
  return { caller, getAdmin, deleteUser, updateUserById, queried };
}
describe("managed user deletion safety", () => {
  it("rejects non-admins before privileged access", async () => {
    const s = setup(false);
    expect((await manageUserDeletion(s.caller, { user_id: targetId }, s.getAdmin)).status).toBe(403);
    expect(s.getAdmin).not.toHaveBeenCalled();
  });
  it.each(["delete", "deactivate"])("rejects own-account %s", async (action) => {
    const s = setup();
    expect((await manageUserDeletion(s.caller, { user_id: callerId, action }, s.getAdmin)).body.code).toBe("SELF_DELETE");
    expect(s.getAdmin).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs and client-supplied roles", async () => {
    const s = setup();
    for (const input of [{ user_id: "bad" }, { user_id: targetId, role: "admin" }]) {
      expect((await manageUserDeletion(s.caller, input, s.getAdmin)).status).toBe(400);
    }
    expect(s.deleteUser).not.toHaveBeenCalled();
  });
  it.each(historicalReferences)("preserves %s.%s history and offers deactivation", async (table, column) => {
    const s = setup(true, `${table}.${column}`);
    const result = await manageUserDeletion(s.caller, { user_id: targetId }, s.getAdmin);
    expect(result.status).toBe(409);
    expect(result.body.can_deactivate).toBe(true);
    expect(s.deleteUser).not.toHaveBeenCalled();
    expect(s.updateUserById).not.toHaveBeenCalled();
  });
  it("fails closed on incomplete integrity checks", async () => {
    const s = setup(true, undefined, true);
    expect((await manageUserDeletion(s.caller, { user_id: targetId }, s.getAdmin)).body.code).toBe("INTEGRITY_CHECK_FAILED");
    expect(s.deleteUser).not.toHaveBeenCalled();
  });
  it("only deletes the auth identity after every history check passes", async () => {
    const s = setup();
    expect((await manageUserDeletion(s.caller, { user_id: targetId }, s.getAdmin)).body.code).toBe("DELETED");
    expect(s.queried).toHaveLength(historicalReferences.length);
    expect(s.deleteUser).toHaveBeenCalledExactlyOnceWith(targetId);
  });
  it("explicit deactivation bans login without deleting historical records", async () => {
    const s = setup(true, "reading_entries.operator_id");
    expect((await manageUserDeletion(s.caller, { user_id: targetId, action: "deactivate" }, s.getAdmin)).body.code).toBe("DEACTIVATED");
    expect(s.updateUserById).toHaveBeenCalledExactlyOnceWith(targetId, { ban_duration: "876000h" });
    expect(s.deleteUser).not.toHaveBeenCalled();
  });
});