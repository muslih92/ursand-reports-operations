// Validation for reading cells (numbers vs. status text).

/** A plain number: 9, 9.9, 0.5, .5, 1250, -5. */
export function isValidNumber(raw: string): boolean {
  return /^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(raw.trim());
}

/**
 * Text that is clearly meant to be a number but is malformed: only digits,
 * dots, commas, spaces and signs, yet not a valid number ("9.9.", "54 2",
 * "1828..", "13..7"). Text with letters (statuses) is never flagged.
 */
export function isMalformedNumber(raw: string): boolean {
  const t = raw.trim();
  if (t === "" || !/\d/.test(t)) return false;
  if (!/^[\d.,\s+-]+$/.test(t)) return false;
  return !isValidNumber(t);
}

/** Equivalent spellings of the fixed quick-mark statuses → canonical code. */
const STATUS_ALIASES: Record<string, string> = {
  STANDBY: "STANDBY", "STAND BY": "STANDBY", "STAND-BY": "STANDBY", "S/B": "STANDBY", "احتياطي": "STANDBY",
  SHUTDOWN: "SHUTDOWN", "SHUT DOWN": "SHUTDOWN", "S/D": "SHUTDOWN", "إيقاف": "SHUTDOWN", "ايقاف": "SHUTDOWN",
  MAINTENANCE: "MAINTENANCE", "UNDER MAINTENANCE": "MAINTENANCE", "تحت الصيانة": "MAINTENANCE", BUSY: "MAINTENANCE",
  OOS: "OOS", "OUT OF SERVICE": "OOS", "OUT OF SERVICE (OOS)": "OOS", "خارج الخدمة": "OOS",
};

/** Normalize a status text to its canonical code; unknown text is kept as typed. */
export function normalizeStatusText(raw: string): string {
  const t = raw.trim();
  const key = t.toUpperCase().replace(/\s+/g, " ");
  return STATUS_ALIASES[key] ?? STATUS_ALIASES[t] ?? t;
}

