import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export type HistoricalPerson = { id: string; full_name: string | null; employee_no: string | null };
const peopleSchema = z.array(z.object({ id: z.string().uuid(), full_name: z.string().nullable(), employee_no: z.string().nullable() }));
// Narrow adapter while the staged schema is deliberately not installed/generated.
export async function listAttributionPeople(db: SupabaseClient): Promise<HistoricalPerson[]> {
  const profiles = await db.from("profiles").select("id, full_name, employee_no, active");
  if (profiles.error) throw new Error("تعذر تحميل أسماء المستخدمين");
  const historicalDb = db as unknown as { from: (table: "historical_user_identities") => { select: (columns: string) => Promise<{ data: unknown; error: { code?: string } | null }> } };
  const history = await historicalDb.from("historical_user_identities").select("id, full_name, employee_no");
  // Existing deployment keeps working before approval of the staged schema.
  if (history.error && !["42P01", "PGRST205"].includes(history.error.code ?? "")) throw new Error("تعذر تحميل الهوية التاريخية");
  const map = new Map<string, HistoricalPerson>();
  for (const p of profiles.data ?? []) map.set(p.id, p);
  for (const h of peopleSchema.parse(history.data ?? [])) {
    const profile = profiles.data?.find(p => p.id === h.id);
    if (!profile?.active) map.set(h.id, h);
  }
  return [...map.values()];
}

export function attributionName(id: string | null, people: HistoricalPerson[], snapshot?: string | null): string | null {
  if (snapshot?.trim()) return snapshot; // Never replace the operation-time name.
  if (!id) return null;
  const person = people.find(p => p.id === id);
  if (!person?.full_name) return id.slice(0, 8);
  return person.employee_no ? `${person.full_name} #${person.employee_no}` : person.full_name;
}
