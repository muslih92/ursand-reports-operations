import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export interface ScopedStation {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
}

/**
 * Station scoping: any user that has a station assigned (and is not an admin
 * / management / viewer) can only see and work within that station.
 */
export function useStationScope() {
  const { profile, isAdmin, hasRole } = useAuth();
  const unrestricted = isAdmin || hasRole("management") || hasRole("viewer");
  const scopedStationId = unrestricted ? null : (profile?.station_id ?? null);
  return { scopedStationId, canPickStation: !scopedStationId };
}

/** Active stations limited to the current user's station scope. */
export function useScopedStations() {
  const { scopedStationId } = useStationScope();
  return useQuery({
    queryKey: ["stations", "active", scopedStationId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("stations")
        .select("id, code, name_en, name_ar")
        .eq("active", true)
        .order("code");
      if (scopedStationId) q = q.eq("id", scopedStationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ScopedStation[];
    },
  });
}
