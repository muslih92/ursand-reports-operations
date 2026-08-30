import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Personal "monitoring stations" list for unrestricted users (admin / management).
 * They can see every station, but may narrow the whole app down to a few
 * stations they want to follow. Stored per user in the browser.
 */
const key = (userId: string) => `station-watch:${userId}`;

export function useStationWatch() {
  const { user } = useAuth();
  const [ids, setIdsState] = useState<string[]>([]);

  useEffect(() => {
    if (!user?.id) { setIdsState([]); return; }
    try {
      const raw = localStorage.getItem(key(user.id));
      setIdsState(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { setIdsState([]); }
  }, [user?.id]);

  const setIds = useCallback(
    (next: string[]) => {
      setIdsState(next);
      if (!user?.id) return;
      try {
        if (next.length === 0) localStorage.removeItem(key(user.id));
        else localStorage.setItem(key(user.id), JSON.stringify(next));
      } catch { /* storage unavailable */ }
      window.dispatchEvent(new Event("station-watch-changed"));
    },
    [user?.id],
  );

  // Keep every mounted consumer in sync.
  useEffect(() => {
    const sync = () => {
      if (!user?.id) return;
      try {
        const raw = localStorage.getItem(key(user.id));
        setIdsState(raw ? (JSON.parse(raw) as string[]) : []);
      } catch { /* ignore */ }
    };
    window.addEventListener("station-watch-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("station-watch-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, [user?.id]);

  return { watchIds: ids, setWatchIds: setIds };
}
