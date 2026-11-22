import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Extract the caller's Supabase access token from the incoming request.
 *
 * Primary source: the `Authorization: Bearer <jwt>` header attached by the
 * client-side function middleware. Fallback: the Supabase session cookie
 * (`sb-<ref>-auth-token`), which is how cookie-based deployments (e.g. the
 * Hostinger production copy) carry the session when no header is present.
 * The cookie may be chunked (`...-auth-token.0`, `.1`, ...) and its value may
 * be URL-encoded JSON or `base64-<base64url(JSON)>`.
 */
export function extractAccessToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  // Group cookie chunks by their base name: sb-<ref>-auth-token[.N]
  const chunks = new Map<string, Map<number, string>>();
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    const match = /^sb-[A-Za-z0-9-]+-auth-token(?:\.(\d+))?$/.exec(name);
    if (!match) continue;
    const base = name.replace(/\.\d+$/, "");
    const index = match[1] ? Number(match[1]) : 0;
    if (!chunks.has(base)) chunks.set(base, new Map());
    chunks.get(base)!.set(index, value);
  }

  for (const parts of chunks.values()) {
    const ordered = [...parts.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    const raw = ordered.join("");
    const token = parseSessionCookie(raw);
    if (token) return token;
  }
  return null;
}

function parseSessionCookie(raw: string): string | null {
  try {
    let text = raw;
    if (text.startsWith("base64-")) {
      const b64 = text.slice(7).replace(/-/g, "+").replace(/_/g, "/");
      text = Buffer.from(b64, "base64").toString("utf8");
    } else {
      text = decodeURIComponent(text);
    }
    const session = JSON.parse(text) as { access_token?: unknown };
    return typeof session.access_token === "string" && session.access_token.length > 0
      ? session.access_token
      : null;
  } catch {
    return null;
  }
}

export interface CallerAuth {
  supabase: ReturnType<typeof createClient<Database>>;
  userId: string;
  claims: Record<string, unknown>;
  accessToken: string;
}

/**
 * Like the generated requireSupabaseAuth middleware, but also accepts
 * cookie-based sessions (no Authorization header). The JWT is always
 * verified server-side via getClaims before any context is granted.
 */
export const requireSupabaseAuthFlexible = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env["SUPABASE_URL"];
    const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Backend is not configured on this server");
    }

    const request = getRequest();
    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const token = extractAccessToken(request);
    if (!token) {
      throw new Error("Unauthorized: No access token provided");
    }
    if (token.split(".").length !== 3) {
      throw new Error("Unauthorized: Invalid token");
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) {
      throw new Error("Unauthorized: Invalid token");
    }

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
        accessToken: token,
      },
    });
  },
);
