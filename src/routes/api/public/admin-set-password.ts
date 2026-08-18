import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Password reset relay.
 *
 * Self-hosted deployments do not carry the service-role key, so they forward
 * admin password resets to this endpoint on the managed deployment. The caller
 * must present the bearer token of a signed-in admin — it is verified here
 * before any privileged work happens.
 */
export const Route = createFileRoute("/api/public/admin-set-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = auth.slice(7);

        const url = process.env["SUPABASE_URL"];
        const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !publishable) {
          return new Response("Backend not configured", { status: 500 });
        }

        const asUser = createClient(url, publishable, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });

        const { data: claims, error: claimsErr } = await asUser.auth.getClaims(token);
        const callerId = claims?.claims?.sub;
        if (claimsErr || !callerId) return new Response("Unauthorized", { status: 401 });

        const { data: isAdmin } = await asUser.rpc("has_role", {
          _user_id: callerId,
          _role: "admin",
        });
        if (!isAdmin) return new Response("Forbidden", { status: 403 });

        let body: { user_id?: string; password?: string };
        try {
          body = (await request.json()) as { user_id?: string; password?: string };
        } catch {
          return new Response("Invalid body", { status: 400 });
        }
        const userId = body.user_id;
        const password = body.password;
        if (!userId || !password || password.length < 6 || password.length > 72) {
          return new Response("Invalid body", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
        if (error) return new Response(error.message, { status: 400 });

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
