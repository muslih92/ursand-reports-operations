import { useCallback, useEffect, useState } from "react";

/** Boolean toggle state persisted in localStorage so it survives reloads and navigation. */
export function usePersistentToggle(key: string, initial = false) {
  const [open, setOpen] = useState<boolean>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setOpen(raw === "1");
    } catch {
      /* ignore */
    }
  }, [key]);

  const toggle = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [key]);

  return [open, toggle] as const;
}
