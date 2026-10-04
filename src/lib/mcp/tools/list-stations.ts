import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_stations",
  title: "List stations",
  description: "List the stations the signed-in user is allowed to see.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const { data, error } = await supabaseForUser(ctx)
      .from("stations")
      .select("id, code, name_en, name_ar, location, active")
      .order("code");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const stations = (data ?? []).map((s) => ({
      id: s.id, code: s.code, name_en: s.name_en, name_ar: s.name_ar, location: s.location, active: s.active,
    }));
    return { content: [{ type: "text", text: JSON.stringify(stations) }], structuredContent: { stations } };
  },
});
