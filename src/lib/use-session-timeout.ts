import { useEffect } from "react";

const KEY = "ursand-session-start";
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000; // 12 hours

export function markSessionStart(now = Date.now()) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, String(now));
  } catch {
    /* ignore */
  }
}

export function clearSessionStart() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function getSessionStart(): number {
  if (typeof window === "undefined") return Date.now();
  const raw = window.localStorage.getItem(KEY);
  const n = raw ? Number(raw) : NaN;
  if (!raw || Number.isNaN(n)) {
    markSessionStart();
    return Date.now();
  }
  return n;
}

/**
 * Signs the user out automatically once 12 hours have passed since sign-in,
 * even if the browser was left open / idle the whole time.
 */
export function useSessionTimeout(active: boolean, onExpire: () => void) {
  useEffect(() => {
    if (!active) return;
    const check = () => {
      if (Date.now() - getSessionStart() >= SESSION_MAX_MS) {
        clearSessionStart();
        onExpire();
      }
    };
    check();
    const id = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [active, onExpire]);
}
