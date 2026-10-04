import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_incidents",
  title: "List incidents",
  description: "List recent incidents the signed-in user can see, optionally for one station.",
  inputSchema: {
    station_id: z.string().uuid().optional().describe("Limit to this station id."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ station_id, limit }, ctx) => {
    let q = supabaseForUser(ctx)
      .from("incidents")
      .select("id, incident_no, title, equipment, severity, status, occurred_at, closed_at, station_id")
      .order("occurred_at", { ascending: false })
      .limit(limit ?? 20);
    if (station_id) q = q.eq("station_id", station_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const incidents = (data ?? []).map((i) => ({
      id: i.id, incident_no: i.incident_no, title: i.title, equipment: i.equipment,
      severity: String(i.severity), status: String(i.status), occurred_at: i.occurred_at,
      closed_at: i.closed_at, station_id: i.station_id,
    }));
    return { content: [{ type: "text", text: JSON.stringify(incidents) }], structuredContent: { incidents } };
  },
});
