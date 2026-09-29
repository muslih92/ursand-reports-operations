import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const restoreDeletedItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ itemId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: visibleItem, error: readError } = await context.supabase
      .from("deleted_items")
      .select("id")
      .eq("id", data.itemId)
      .is("restored_at", null)
      .gte("deleted_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!visibleItem) throw new Error("This item is unavailable or you cannot restore it");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      rpc: (
        name: string,
        args: { _item_id: string; _actor_id: string },
      ) => Promise<{ data: number | null; error: { message: string } | null }>;
    };
    const { data: restored, error } = await admin.rpc("restore_deleted_item", {
      _item_id: data.itemId,
      _actor_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { restored: restored ?? 0 };
  });