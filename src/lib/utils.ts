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

export function timeSlotsFor(freq: "hourly" | "every_2h" | "every_6h"): string[] {
  if (freq === "every_6h") return ["04:00", "10:00", "16:00", "22:00"];
  if (freq === "every_2h") return Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, "0")}:00`);
  return Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
}
