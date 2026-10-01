import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useStationWatch } from "@/lib/station-watch";

export interface ScopedStation {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
}

export interface StationScopeOptions {
  /** Supervisors may view every station (editing stays limited to their own). */
  supervisorViewAll?: boolean;
}

/**
 * Station scoping:
 * - Admin / management / viewer: all stations.
 * - Supervisor: all stations when `supervisorViewAll` (e.g. readings), else own.
 * - Operator: only assigned stations (main + at most one extra).
 * `editableStationIds` = the user's own assigned stations (main + extras).
 */
export function useStationScope(opts: StationScopeOptions = {}) {
  const { profile, isAdmin, hasRole, user } = useAuth();
  const { watchIds } = useStationWatch();
  const unrestrictedRole =
    isAdmin || hasRole("management") || hasRole("viewer") ||
    (!!opts.supervisorViewAll && hasRole("supervisor"));
  const watching = unrestrictedRole && watchIds.length > 0;
  const unrestricted = unrestrictedRole && !watching;

  const { data: extra } = useQuery({
    queryKey: ["profile-stations", user?.id ?? "none"],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_stations")
        .select("station_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.station_id as string);
    },
  });

  const ownStationIds = Array.from(
    new Set([profile?.station_id, ...(extra ?? [])].filter(Boolean) as string[]),
  );

  const allowedStationIds = watching ? watchIds : unrestricted ? [] : ownStationIds;

  const scopedStationId = allowedStationIds.length === 1 ? allowedStationIds[0]! : null;
  return {
    scopedStationId,
    allowedStationIds,
    editableStationIds: ownStationIds,
    isRestricted: !unrestricted && allowedStationIds.length > 0,
    canPickStation: !scopedStationId,
  };
}

/** Active stations limited to the current user's station scope. */
export function useScopedStations(opts: StationScopeOptions = {}) {
  const { allowedStationIds, isRestricted } = useStationScope(opts);
  const key = isRestricted ? [...allowedStationIds].sort().join(",") : "all";
  return useQuery({
    queryKey: ["stations", "active", key],
    queryFn: async () => {
      let q = supabase
        .from("stations")
        .select("id, code, name_en, name_ar")
        .eq("active", true)
        .order("code");
      if (isRestricted) q = q.in("id", allowedStationIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ScopedStation[];
    },
  });
}
