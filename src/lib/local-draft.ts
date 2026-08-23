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

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      writeDraft(key, data);
      setSavedAt(Date.now());
    }, delay);
    return () => window.clearTimeout(id);
  }, [key, data, enabled, delay]);

  // Flush on tab hide / unload so idle sessions never lose input.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => writeDraft(key, data);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, data, enabled]);

  return { savedAt, clear: () => { clearDraft(key); setSavedAt(null); } };
}
