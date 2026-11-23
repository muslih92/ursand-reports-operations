import { shiftWindow } from "@/lib/shift-status";

/**
 * Helpers that make sure a write really reached the database.
 *
 * Supabase/PostgREST does NOT return an error when Row Level Security filters
 * out the row of an UPDATE: it simply changes zero rows and answers 200. A
 * plain `.update(...).eq("id", id)` therefore looks "saved" even when nothing
 * was written. Always add `.select("id")` and pass the result through
 * `ensureWritten` so the user sees a real error instead of a false "Saved".
 */
export function ensureWritten<T>(
  res: { data: T[] | null; error: unknown },
  locale: string,
  expected = 1,
): T[] {
  if (res.error) throw res.error;
  const rows = res.data ?? [];
  if (rows.length < expected) {
    throw new Error(
      locale === "ar"
        ? "لم يتم الحفظ: ليس لديك صلاحية تعديل هذا السجل أو أنه حُذف. لم تُفقد بياناتك من الشاشة — راجع المشرف ثم أعد المحاولة."
        : "Not saved: you are not allowed to change this record or it was removed. Your input is still on screen — check with your supervisor and retry.",
    );
  }
  return rows;
}

/**
 * The date a shift belongs to, in the browser's local time zone.
 * The night shift runs 18:00 → 06:00, so the early-morning hours (00:00–05:59)
 * still belong to the night shift that started the previous evening.
 * Never use `toISOString()` for this: it is UTC and switches date at 03:00 in
 * Saudi Arabia, splitting one night shift across two dates.
 */
export function shiftDateISO(now: Date = new Date()): string {
  return shiftWindow(now).date;
}
