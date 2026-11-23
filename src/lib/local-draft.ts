import { useEffect, useRef, useState } from "react";

/**
 * Autosave form state to localStorage so nothing is lost while the tab is idle,
 * refreshed, or accidentally closed.
 */
export interface DraftEnvelope<T> {
  savedAt: number;
  data: T;
}

const PREFIX = "ursand-draft:";

/**
 * Callbacks that copy unsaved form input to localStorage. They run right
 * before a forced redirect (session expiry) so nothing typed is lost.
 */
export const draftFlushers = new Set<() => void>();
export function flushAllDrafts() {
  for (const f of draftFlushers) {
    try {
      f();
    } catch {
      /* ignore */
    }
  }
}

/** Set while redirecting to sign-in after the session expired. */
export function markSessionExpiring() {
  if (typeof window !== "undefined") (window as unknown as { __ursSessionExpiring?: boolean }).__ursSessionExpiring = true;
}
export function isSessionExpiring() {
  return typeof window !== "undefined" && !!(window as unknown as { __ursSessionExpiring?: boolean }).__ursSessionExpiring;
}
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // keep drafts 3 days

export function readDraft<T>(key: string): DraftEnvelope<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * Debounced autosave of `data` under `key`. Returns the timestamp of the last
 * autosave (or null). Autosave is paused while `enabled` is false.
 */
export function useAutoDraft<T>(key: string, data: T, enabled: boolean, delay = 1200) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const first = useRef(true);
  // Latest value that has NOT been copied to localStorage yet (null = none).
  const pendingRef = useRef<{ key: string; data: T } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    pendingRef.current = { key, data };
    const id = window.setTimeout(() => {
      writeDraft(key, data);
      pendingRef.current = null;
      setSavedAt(Date.now());
    }, delay);
    return () => window.clearTimeout(id);
  }, [key, data, enabled, delay]);

  // Flush on tab hide / unload / in-app navigation / session expiry so the
  // last keystrokes inside the debounce window are never lost.
  useEffect(() => {
    const flushPending = () => {
      const p = pendingRef.current;
      if (!p) return;
      writeDraft(p.key, p.data);
      pendingRef.current = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushPending();
    };
    window.addEventListener("beforeunload", flushPending);
    document.addEventListener("visibilitychange", onVisibility);
    draftFlushers.add(flushPending);
    return () => {
      window.removeEventListener("beforeunload", flushPending);
      document.removeEventListener("visibilitychange", onVisibility);
      draftFlushers.delete(flushPending);
      flushPending();
    };
  }, []);

  return {
    savedAt,
    clear: () => {
      pendingRef.current = null;
      clearDraft(key);
      setSavedAt(null);
    },
  };
}
