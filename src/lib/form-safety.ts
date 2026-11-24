import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import {
  clearDraft,
  draftFlushers,
  isSessionExpiring,
  readDraft,
  writeDraft,
} from "@/lib/local-draft";

/**
 * Warn before leaving a page that still holds input which has not reached the
 * database — both for in-app navigation (sidebar, Back button) and for closing
 * or refreshing the tab.
 */
export function useUnsavedChangesGuard(dirty: boolean, locale: string, message?: string) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const bypassRef = useRef(false);
  const text =
    message ??
    (locale === "ar"
      ? "لديك بيانات لم تُحفظ بعد في النظام. هل تريد مغادرة الصفحة؟\n(ستبقى نسخة احتياطية على هذا الجهاز وتُستعاد عند الرجوع)"
      : "You have input that is not saved yet. Leave this page?\n(A backup copy stays on this device and is restored when you come back)");
  useBlocker({
    shouldBlockFn: () => {
      if (!dirtyRef.current || bypassRef.current || isSessionExpiring()) return false;
      return !window.confirm(text);
    },
    enableBeforeUnload: () => dirtyRef.current && !bypassRef.current && !isSessionExpiring(),
  });
  /** Call right after a successful save that immediately reloads/navigates. */
  return useCallback(() => {
    bypassRef.current = true;
  }, []);
}

/**
 * Local safety copy for an editor form.
 *
 * - `ready` turns true once the form has been filled from the database (or is
 *   a blank new form). At that moment the current value becomes the "saved"
 *   baseline and an older unsaved draft for the same key is offered back via
 *   `onRestore`.
 * - While the value differs from the baseline it is copied to localStorage
 *   (debounced, plus on tab hide / close / unmount / session expiry).
 * - Call `markSaved(snapshot)` after a successful save; the draft is removed
 *   when nothing newer was typed meanwhile.
 */
export function useFormDraft<T>(opts: {
  key: string;
  value: T;
  ready: boolean;
  onRestore?: (data: T) => void;
}) {
  const { key, value, ready, onRestore } = opts;
  const json = JSON.stringify(value);
  const baselineRef = useRef<string | null>(null);
  const readyKeyRef = useRef<string | null>(null);
  const latestRef = useRef<{ key: string; value: T; json: string }>({ key, value, json });
  latestRef.current = { key, value, json };
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [, force] = useState(0);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // Establish the baseline once per key, then offer an unsaved draft back.
  useEffect(() => {
    if (!ready || readyKeyRef.current === key) return;
    readyKeyRef.current = key;
    baselineRef.current = json;
    setRestoredAt(null);
    const draft = readDraft<T>(key);
    if (draft && JSON.stringify(draft.data) !== json && onRestoreRef.current) {
      onRestoreRef.current(draft.data);
      setRestoredAt(draft.savedAt);
    } else if (draft) {
      clearDraft(key);
    }
    force((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  const isReady = ready && readyKeyRef.current === key && baselineRef.current !== null;
  const dirty = isReady && json !== baselineRef.current;

  const flush = useCallback(() => {
    const cur = latestRef.current;
    if (readyKeyRef.current !== cur.key || baselineRef.current === null) return;
    if (cur.json === baselineRef.current) return;
    writeDraft(cur.key, cur.value);
  }, []);

  // Debounced copy while dirty; remove the copy once the form matches the DB.
  useEffect(() => {
    if (!isReady) return;
    if (!dirty) {
      clearDraft(key);
      return;
    }
    const id = window.setTimeout(() => writeDraft(key, value), 800);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json, isReady, dirty, key]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHide);
    draftFlushers.add(flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onHide);
      draftFlushers.delete(flush);
      flush(); // unmount (in-app navigation) — keep what was typed
    };
  }, [flush]);

  const markSaved = useCallback((snapshot: T) => {
    const s = JSON.stringify(snapshot);
    baselineRef.current = s;
    if (latestRef.current.json === s) clearDraft(latestRef.current.key);
    setRestoredAt(null);
    force((n) => n + 1);
  }, []);

  /** Throw the restored draft away and go back to the saved version. */
  const discard = useCallback(() => {
    clearDraft(latestRef.current.key);
    setRestoredAt(null);
  }, []);

  return { dirty, restoredAt, markSaved, discard };
}
