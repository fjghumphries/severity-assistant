/**
 * Threshold bounds: the stored `threshold_bounds` string has one slot per severity, in order
 * Critical (1), High (2), Medium (3), Low (4), e.g. "70,,," or "50,20,10,5". A blank slot means
 * that severity is not used. A value at or above a slot's bound gets that severity; the highest
 * matching one wins. Pure, shared by the compiler, validation, descriptions and the editor.
 */

export const BOUND_SLOTS = 4;
export type Bound = number | null;

/** Parses the stored string into four slots; blank or non-numeric slots are null. Always 4 long. */
export function parseBounds(stored: string | null): Bound[] {
  const parts = (stored ?? "").split(",").map((s) => s.trim());
  return Array.from({ length: BOUND_SLOTS }, (_, i) => {
    const part = parts[i] ?? "";
    if (part === "") return null;
    const n = Number(part);
    return Number.isNaN(n) ? null : n;
  });
}

/** True when every slot is filled: the one case where a value below all bounds is Informational (5). */
export function allBoundsSet(bounds: Bound[]): boolean {
  return bounds.every((b) => b !== null);
}

/** What is wrong with the stored bounds, or null when they are usable. */
export function boundsProblem(stored: string | null): string | null {
  const raw = (stored ?? "").split(",").map((s) => s.trim());
  if (raw.length > BOUND_SLOTS) return "at most 4 values (Critical to Low)";
  if (raw.some((b) => b !== "" && Number.isNaN(Number(b))))
    return "values must be numbers";
  const filled = parseBounds(stored).filter((b): b is number => b !== null);
  if (filled.length === 0) return "set at least one value";
  for (let i = 1; i < filled.length; i++) {
    if (!(filled[i] < filled[i - 1]))
      return "values must get strictly lower from Critical down to Low";
  }
  return null;
}

const NAMES = ["Critical", "High", "Medium", "Low"];

/** "Critical >= 70", or "Critical >= 70, High >= 50, Medium >= 20, Low >= 10, else Informational". */
export function summarizeBounds(stored: string | null): string {
  const bounds = parseBounds(stored);
  const parts = bounds.flatMap((b, i) =>
    b === null ? [] : [`${NAMES[i]} >= ${b}`],
  );
  if (parts.length === 0) return "unconfigured";
  if (allBoundsSet(bounds)) parts.push("else Informational");
  return parts.join(", ");
}
