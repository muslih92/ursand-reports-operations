import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Map employee number to synthetic email for Supabase Auth.
 * Users sign in with employee_no; internally we use `emp{no}@wtco.local`.
 */
export function empEmail(employeeNo: string) {
  return `emp${employeeNo.trim()}@wtco.local`;
}

/** Reading slots always start at 04:00 (dawn) so operators follow one sequence:
 *  04:00 → 08:00 → 16:00 → 20:00 for the 4-times-a-day stations. */
function rotateToDawn(slots: string[]): string[] {
  const i = slots.indexOf("04:00");
  return i > 0 ? [...slots.slice(i), ...slots.slice(0, i)] : slots;
}

export function timeSlotsFor(freq: "hourly" | "every_2h" | "every_6h" | "every_4h"): string[] {
  if (freq === "every_6h" || freq === "every_4h") return ["04:00", "08:00", "16:00", "20:00"];
  if (freq === "every_2h")
    return rotateToDawn(Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, "0")}:00`));
  return rotateToDawn(Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`));
}

