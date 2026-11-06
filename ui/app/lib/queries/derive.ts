import { DiscoveryRow, ROLE_COLUMNS, RoleColumn } from "../types/discovery";

export interface EventCatalogueEntry {
  eventName: string;
  count: number;
  /** Distinct `event.severity` values seen for this name; "" means no severity. */
  severities: string[];
}

/** Distinct event names in the discovery result, ordered by volume descending. */
export function deriveEventCatalogue(
  rows: DiscoveryRow[],
): EventCatalogueEntry[] {
  const byName = new Map<string, { count: number; severities: Set<string> }>();
  for (const row of rows) {
    const name = row["event.name"];
    const entry = byName.get(name) ?? {
      count: 0,
      severities: new Set<string>(),
    };
    entry.count += row.c;
    entry.severities.add(row["event.severity"] ?? "");
    byName.set(name, entry);
  }
  return Array.from(byName.entries())
    .map(([eventName, e]) => ({
      eventName,
      count: e.count,
      // Sorted, "" (no severity) last, so similar event names are still told apart by what
      // severity they carry today.
      severities: [...e.severities].sort((a, b) =>
        a === "" ? 1 : b === "" ? -1 : a.localeCompare(b),
      ),
    }))
    .sort((a, b) => b.count - a.count);
}

export interface RoleValueEntry {
  value: string;
  count: number;
}

/** Distinct values seen for a single role column, ordered by volume descending. */
export function deriveRoleValues(
  rows: DiscoveryRow[],
  role: RoleColumn,
): RoleValueEntry[] {
  const byValue = new Map<string, number>();
  for (const row of rows) {
    const value = row[role];
    if (value === null) continue;
    byValue.set(value, (byValue.get(value) ?? 0) + row.c);
  }
  return Array.from(byValue.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

export interface SeverityDistributionEntry {
  severity: string | null;
  count: number;
}

/** Severity distribution across the discovery window. `severity: null` means unset. */
export function deriveSeverityDistribution(
  rows: DiscoveryRow[],
): SeverityDistributionEntry[] {
  const bySeverity = new Map<string | null, number>();
  for (const row of rows) {
    const severity = row["event.severity"];
    bySeverity.set(severity, (bySeverity.get(severity) ?? 0) + row.c);
  }
  return Array.from(bySeverity.entries())
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => {
      // Nulls last; otherwise ascending severity (1 = most severe, sorts first).
      if (a.severity === null) return 1;
      if (b.severity === null) return -1;
      return Number(a.severity) - Number(b.severity);
    });
}

/**
 * A single condition in a rule's match: one role equal to one value, or the special
 * "(not set)" value which matches an absent/null role. Mirrors the rule model in
 * docs/03-config-store-and-rule-model.md -- equality only, up to 4 conditions.
 */
export interface RoleCondition {
  role: RoleColumn;
  /** `null` means "(not set)" -- matches rows where this role is null. */
  value: string | null;
}

/**
 * Live match count for a candidate rule, computed entirely client-side from the cached
 * discovery result. This is what makes the match preview instant and free: a keyed rule is
 * just a filter over the five columns the discovery query already returns.
 */
export function countMatches(
  rows: DiscoveryRow[],
  eventName: string | null,
  conditions: RoleCondition[],
): number {
  let total = 0;
  for (const row of rows) {
    if (eventName !== null && row["event.name"] !== eventName) continue;
    let matches = true;
    for (const cond of conditions) {
      if (row[cond.role] !== cond.value) {
        matches = false;
        break;
      }
    }
    if (matches) total += row.c;
  }
  return total;
}

/** Event names present in the discovery result that no rule's event_name touches. */
export function deriveUncoveredEvents(
  rows: DiscoveryRow[],
  configuredEventNames: Set<string>,
): EventCatalogueEntry[] {
  return deriveEventCatalogue(rows).filter(
    (entry) => !configuredEventNames.has(entry.eventName),
  );
}

/**
 * Fill rate (0-1) for one of the discovery query's fixed role columns (bu/app/tier/stage).
 *
 * KNOWN LIMITATION: the discovery query only probes these four fields (the original test tenant
 * mapping). Live fill-rate stats are only available for roles mapped to exactly these fields;
 * a custom role mapped to a different field shows no live stats yet. Full free-form field
 * discovery (any primary_tags.* key) is not built -- see docs/03-config-store-and-rule-model.md
 * Part 4 for the intended generic discovery approach.
 */
export function deriveFillRate(
  rows: DiscoveryRow[],
  column: RoleColumn,
): number {
  let total = 0;
  let filled = 0;
  for (const row of rows) {
    total += row.c;
    if (row[column] !== null) filled += row.c;
  }
  return total === 0 ? 0 : filled / total;
}

/** Maps a tenant field path to the discovery column that has live stats for it, if any. */
export const KNOWN_FIELD_TO_COLUMN: Record<string, RoleColumn> = {
  "primary_tags.bu": "bu",
  "primary_tags.landscape": "app",
  "primary_tags.tier": "tier",
  "primary_tags.stage": "stage",
};

export { ROLE_COLUMNS };
