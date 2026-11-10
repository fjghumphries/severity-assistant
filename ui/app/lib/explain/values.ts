/**
 * The values to offer for each label in "Explain this event", so nobody has to type them: those seen
 * on recent events (for the chosen event when there is one, since those are the ones that can
 * occur together), plus any value an existing rule already uses for that label. Pure.
 */

import { KNOWN_FIELD_TO_COLUMN } from "../queries/derive";
import type { DiscoveryRow, RoleColumn } from "../types/discovery";
import type { RoleRegistry } from "../types/registry";
import { getConditions, type Rule } from "../types/rule";

const ROLE_TO_COLUMN: Record<string, RoleColumn> = {
  business_unit: "bu",
  application: "app",
  tier: "tier",
  stage: "stage",
};

export interface ValueOption {
  value: string;
  /** Events carrying it in the window; 0 when it only comes from a rule. */
  count: number;
}

/** The discovery column behind a label, or undefined when the live data does not carry it. */
export function columnFor(
  registry: RoleRegistry,
  role: string,
): RoleColumn | undefined {
  const def = registry.roles.find((r) => r.role === role);
  if (!def) return undefined;
  return ROLE_TO_COLUMN[def.role] ?? KNOWN_FIELD_TO_COLUMN[def.field];
}

export function labelValueOptions(
  rows: DiscoveryRow[],
  rules: Rule[],
  registry: RoleRegistry,
  roles: string[],
  eventName: string | null,
): Record<string, ValueOption[]> {
  const out: Record<string, ValueOption[]> = {};
  const forEvent =
    eventName === null
      ? rows
      : rows.filter((r) => r["event.name"] === eventName);
  // Nothing seen for this event (a rare one): fall back to every event rather than offer nothing.
  const source = forEvent.length > 0 ? forEvent : rows;

  for (const role of roles) {
    const counts = new Map<string, number>();
    const column = columnFor(registry, role);
    if (column) {
      for (const r of source) {
        const v = r[column];
        if (v === null || v === undefined || v === "") continue;
        counts.set(v, (counts.get(v) ?? 0) + Number(r.c));
      }
    }
    for (const rule of rules) {
      for (const c of getConditions(rule)) {
        if (c.role === role && c.value) {
          if (!counts.has(c.value)) counts.set(c.value, 0);
        }
      }
    }
    out[role] = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  return out;
}
