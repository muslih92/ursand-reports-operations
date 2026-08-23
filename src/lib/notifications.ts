import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/** Raw client (generated types may lag behind the latest migrations). */
const sb = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface AppNotification {
  id: string;
  user_id: string;
  station_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

/** Deviation threshold used across the app (10%). */
export const DEVIATION_THRESHOLD = 0.1;

/** True when `value` deviates more than 10% from the previous-day average. */
export function isDeviating(value: number | null | undefined, baseline: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  if (baseline === null || baseline === undefined || Number.isNaN(baseline)) return false;
  if (baseline === 0) return false;
  return Math.abs(value - baseline) / Math.abs(baseline) > DEVIATION_THRESHOLD;
}

export function deviationPct(value: number, baseline: number) {
  if (!baseline) return 0;
  return ((value - baseline) / Math.abs(baseline)) * 100;
}

/** Fan-out an in-app notification to the station supervisors + admins/management. */
export async function notifyStation(input: {
  stationId: string;
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  includeOperators?: boolean;
  /** Explicit target roles; overrides includeOperators when provided. */
  roles?: string[];
}) {
  if (input.roles && input.roles.length > 0) {
    const { error } = await sb.rpc("notify_station_roles", {
      _station_id: input.stationId,
      _kind: input.kind,
      _title: input.title,
      _body: input.body ?? null,
      _link: input.link ?? null,
      _roles: input.roles,
    });
    if (error) throw error;
    return;
  }
  const { error } = await sb.rpc("notify_station", {
    _station_id: input.stationId,
    _kind: input.kind,
    _title: input.title,
    _body: input.body ?? null,
    _link: input.link ?? null,
    _include_operators: input.includeOperators ?? false,
  });
  if (error) throw error;
}


export function useNotifications(limit = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id ?? "none"],
    enabled: !!user?.id,
    refetchInterval: 20000,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await sb
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });
}

export function useNotificationActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("notifications").update({ read: true }).eq("read", false);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { markRead, markAllRead };
}
