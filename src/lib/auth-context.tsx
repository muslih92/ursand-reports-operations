import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSessionTimeout, markSessionStart, clearSessionStart } from "@/lib/use-session-timeout";

export type AppRole = "admin" | "supervisor" | "operator" | "viewer" | "management";

export interface AppProfile {
  id: string;
  employee_no: string;
  full_name: string;
  station_id: string | null;
  active: boolean;
}

interface AuthCtx {
  user: User | null;
  profile: AppProfile | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (r: AppRole) => boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const qc = useQueryClient();

  const loadUserData = async (u: User | null) => {
    if (!u) { setProfile(null); setRoles([]); return; }
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("id, employee_no, full_name, station_id, active").eq("id", u.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.id),
    ]);
    setProfile(p as AppProfile | null);
    setRoles((r ?? []).map((x: { role: AppRole }) => x.role));
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      await loadUserData(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_IN") markSessionStart();
      if (event === "SIGNED_OUT") clearSessionStart();
      setUser(session?.user ?? null);
      // Defer to avoid deadlock
      setTimeout(() => { void loadUserData(session?.user ?? null); }, 0);
      router.invalidate();
      if (event !== "SIGNED_OUT") qc.invalidateQueries();
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
     
  }, []);

  const signOut = async () => {
    clearSessionStart();
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  // Auto sign-out 12 hours after sign-in, even if the browser stayed open.
  useSessionTimeout(!!user, () => {
    toast.warning("انتهت الجلسة (12 ساعة). يرجى تسجيل الدخول من جديد. / Session expired after 12 hours.");
    void signOut();
  });


  const refresh = async () => { await loadUserData(user); };

  return (
    <Ctx.Provider value={{
      user, profile, roles, loading,
      hasRole: (r) => roles.includes(r),
      isAdmin: roles.includes("admin"),
      signOut, refresh,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
