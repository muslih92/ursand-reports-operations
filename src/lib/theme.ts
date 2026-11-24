import { useCallback, useEffect, useState } from "react";

/**
 * Light / dark appearance for the app UI.
 *
 * The choice is stored per browser in localStorage ("urs-theme") and applied
 * as the `dark` class on <html>. Printed pages and PDF exports always stay
 * light: print CSS resets the colours, and PDF export renders in a separate
 * frame that never gets the `dark` class.
 */
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "urs-theme";
const THEME_EVENT = "urs-theme-change";
const THEME_COLOR: Record<Theme, string> = { light: "#0f4c81", dark: "#0f1a24" };

/**
 * Runs in <head> before the page paints, so a dark-mode user never sees a
 * white flash. Keep it tiny and dependency-free.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="dark"){var d=document.documentElement;d.classList.add("dark");d.style.colorScheme="dark";}}catch(e){}})();`;

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute("content", THEME_COLOR[theme]));
}

export function useTheme() {
  // Start as "light" on both server and client to keep hydration identical,
  // then sync with what the init script already applied.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(readTheme());
    const onChange = () => setThemeState(readTheme());
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      applyTheme(e.newValue === "dark" ? "dark" : "light");
      onChange();
    };
    window.addEventListener(THEME_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode: still applies for this visit */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(readTheme() === "dark" ? "light" : "dark");
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}
