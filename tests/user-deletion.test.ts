import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { manageUserDeletion } from "@/lib/user-deletion.server";
const callerId = "10000000-0000-4000-8000-000000000001";
const targetId = "10000000-0000-4000-8000-000000000002";
function setup(options: { role?: boolean; prepareError?: string; confirm?: boolean; state?: string; authError?: boolean; absent?: boolean } = {}) {
  const deleteUser = vi.fn(async () => ({ error: null }));
  const updateUserById = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async (name: string) => name === "prepare_user_deletion"
    ? { data: { state: options.state ?? "prepared", protected_relations: 6 }, error: options.prepareError ? { message: options.prepareError } : null }
    : { data: options.confirm ?? true, error: null });
  const from = vi.fn(() => { throw new Error("No operational writes allowed"); });
  const admin = { rpc, from, auth: { admin: { getUserById: async () => ({ data: { user: options.absent ? null : { id: targetId } }, error: options.authError ? { code: "unexpected_failure" } : null }), deleteUser, updateUserById } } } as unknown as SupabaseClient;
  const caller = { userId: callerId, supabase: { rpc: async () => ({ data: options.role ?? true, error: null }) } as unknown as SupabaseClient };
  const getAdmin = vi.fn(async () => admin);
  return { caller, getAdmin, deleteUser, updateUserById, rpc, from };
}
describe("permanent deletion safety", () => {
  it("rejects non-admins before privileged access", async () => {
    const s = setup({ role: false });
    expect((await manageUserDeletion(s.caller, { user_id: targetId }, s.getAdmin)).status).toBe(403);
    expect(s.getAdmin).not.toHaveBeenCalled();
  });
  it.each(["delete", "deactivate"])("blocks current account %s", async action => {
    const s = setup();
    expect((await manageUserDeletion(s.caller, { user_id: callerId, action }, s.getAdmin)).body.code).toBe("SELF_DELETE");
    expect(s.getAdmin).not.toHaveBeenCalled();
  });
  it("rejects invalid and client-supplied role inputs", async () => {
    const s = setup();
    for (const input of [{ user_id: "bad" }, { user_id: targetId, role: "admin" }]) expect((await manageUserDeletion(s.caller, input, s.getAdmin)).status).toBe(400);
    expect(s.deleteUser).not.toHaveBeenCalled();
  });
  it.each(["delete", "deactivate"])("blocks last active admin %s", async action => {
    const s = setup({ prepareError: "LAST_ACTIVE_ADMIN" });
    expect((await manageUserDeletion(s.caller, { user_id: targetId, action }, s.getAdmin)).body.code).toBe("LAST_ACTIVE_ADMIN");
    expect(s.updateUserById).not.toHaveBeenCalled();
    expect(s.deleteUser).not.toHaveBeenCalled();
  });
  it.each(["function missing", "RELATIONS_NOT_READY", "IDENTITY_NOT_READY"])("fails closed before Auth changes: %s", async prepareError => {
    const s = setup({ prepareError });
    expect((await manageUserDeletion(s.caller, { user_id: targetId }, s.getAdmin)).body.code).toBe("SCHEMA_NOT_READY");
    expect(s.deleteUser).not.toHaveBeenCalled();
  });
  it("deletes only login after reservation, never operational rows", async () => {
    const s = setup();
    expect((await manageUserDeletion(s.caller, { user_id: targetId }, s.getAdmin)).body.code).toBe("DELETED");
    expect(s.rpc).toHaveBeenNthCalledWith(1, "prepare_user_deletion", { _actor: callerId, _target: targetId, _action: "delete" });
    expect(s.deleteUser).toHaveBeenCalledExactlyOnceWith(targetId);
    expect(s.from).not.toHaveBeenCalled();
    expect(s.rpc.mock.invocationCallOrder[0]).toBeLessThan(s.deleteUser.mock.invocationCallOrder[0]);
  });
  it("does not announce success when Auth deletion is not confirmed", async () => {
    const s = setup({ confirm: false });
    const out = await manageUserDeletion(s.caller, { user_id: targetId }, s.getAdmin);
    expect(out.body.ok).toBe(false);
    expect(out.body.retryable).toBe(true);
  });
  it("does not interpret unexpected auth errors as missing user", async () => {
    const s = setup({ authError: true });
    expect((await manageUserDeletion(s.caller, { user_id: targetId }, s.getAdmin)).body.ok).toBe(false);
    expect(s.deleteUser).not.toHaveBeenCalled();
  });
  it("resumes after Auth deleted but completion was interrupted", async () => {
    const s = setup({ absent: true });
    expect((await manageUserDeletion(s.caller, { user_id: targetId }, s.getAdmin)).body.code).toBe("DELETED");
    expect(s.deleteUser).not.toHaveBeenCalled();
    expect(s.rpc).toHaveBeenLastCalledWith("complete_user_deletion", { _actor: callerId, _target: targetId, _action: "delete" });
  });
  it("rechecks completed jobs without deleting again", async () => {
    const s = setup({ state: "completed" });
    expect((await manageUserDeletion(s.caller, { user_id: targetId }, s.getAdmin)).body.ok).toBe(true);
    expect(s.deleteUser).not.toHaveBeenCalled();
  });
  it("deactivates without deleting auth or history", async () => {
    const s = setup();
    expect((await manageUserDeletion(s.caller, { user_id: targetId, action: "deactivate" }, s.getAdmin)).body.code).toBe("DEACTIVATED");
    expect(s.updateUserById).toHaveBeenCalledExactlyOnceWith(targetId, { ban_duration: "876000h" });
    expect(s.deleteUser).not.toHaveBeenCalled();
    expect(s.from).not.toHaveBeenCalled();
  });
});
