import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listStations from "./tools/list-stations";
import listIncidents from "./tools/list-incidents";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "your-helpful-assistant",
  title: "Your Helpful Assistant",
  version: "0.1.0",
  instructions:
    "Read-only tools for the WTCO readings & incidents system. Results respect the signed-in user's station access. Use `list_stations` first, then `list_incidents`.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listStations, listIncidents],
});
