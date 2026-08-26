/**
 * When a session silently expires, PostgREST executes requests as `anon`.
 * Role-gated RLS policies then raise "permission denied for function has_role"
 * (and similar) instead of returning zero rows. Treat those as an expired
 * session: sign out cleanly and send the user to the sign-in page instead of
 * leaving broken/blank screens behind.
 */
const EXPIRED_PATTERNS = [
  "permission denied for function",
  "jwt expired",
  "invalid refresh token",
  "refresh token not found",
];

let handling = false;

export function isSessionExpiredError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ((error as { message?: string })?.message ?? "");
  const lower = msg.toLowerCase();
  return EXPIRED_PATTERNS.some((p) => lower.includes(p));
}

export async function handlePossibleSessionExpiry(error: unknown): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isSessionExpiredError(error)) return false;
  if (handling) return true;
  handling = true;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.signOut().catch(() => undefined);
  } catch {
    /* ignore */
  }
  const path = window.location.pathname + window.location.search;
  if (!window.location.pathname.startsWith("/auth")) {
    window.location.replace(`/auth?redirect=${encodeURIComponent(path)}`);
  }
  return true;
}
