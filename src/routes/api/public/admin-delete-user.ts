import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/admin-delete-user")({
  server: { handlers: {
    POST: async ({ request }) => {
      const respond = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
      const authorization = request.headers.get("authorization") ?? "";
      if (!authorization.startsWith("Bearer ") || !authorization.slice(7).trim()) {
        return respond({ ok: false, code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" }, 401);
      }
      const url = process.env["SUPABASE_URL"];
      const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
      if (!url || !key) return respond({ ok: false, code: "UNAVAILABLE", message: "الخدمة غير متاحة" }, 503);
      const token = authorization.slice(7).trim();
      const asUser = createClient(url, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      });
      try {
        const { data, error } = await asUser.auth.getUser(token);
        if (error || !data.user) return respond({ ok: false, code: "UNAUTHORIZED", message: "جلسة الدخول غير صالحة" }, 401);
        const raw = await request.text();
        if (raw.length > 2048) return respond({ ok: false, code: "INVALID_INPUT", message: "طلب غير صالح" }, 400);
        let input: unknown;
        try { input = JSON.parse(raw); } catch { return respond({ ok: false, code: "INVALID_INPUT", message: "طلب غير صالح" }, 400); }
        const { manageUserDeletion } = await import("@/lib/user-deletion.server");
        const { tryAdmin } = await import("@/lib/users.server");
        const outcome = await manageUserDeletion({ supabase: asUser, userId: data.user.id }, input, tryAdmin);
        return respond(outcome.body, outcome.status);
      } catch {
        return respond({ ok: false, code: "UNAVAILABLE", message: "تعذر تنفيذ العملية بأمان" }, 503);
      }
    },
    // Deliberately no browser CORS access: Hostinger's server relays the request.
    OPTIONS: () => new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } }),
  } },
});