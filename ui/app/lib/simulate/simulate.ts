/**
 * Impact simulation + coverage (docs/05, Phase 7): evaluates the rule set over the cached
 * discovery rows -- the same (event.name x role values x severity) groups the whole UI is built
 * on -- and reports what severity each group would get, versus what it has today. No queries, no
 * SDK: pure and unit-testable. It mirrors the compiled semantics (D19/D20): a matching Default
 * sets the severity, matching Exceptions override it in `order` with the last match winning, and
 * an event nothing touched falls back to `defaultSeverity` (D12).
 *
 * Honest limits -- these are reported, never silently approximated:
 *  - Rules matching on an anomaly detector (D18) and threshold rules cannot be evaluated: the
 *    discovery rows carry neither `dt.settings.object_id` nor `event.description`. They are
 *    returned in `skippedRules` with a reason.
 *  - Roles mapped to a field the discovery query doesn't probe cannot be evaluated either.
 *  - This is event-level. D14 wants a problem-level rollup ("N problems raised to severity 1"),
 *    which needs problem data this view doesn't have; treat event-level numbers as a floor on
 *    blast radius, since a problem takes the most severe of its events.
 */

import { KNOWN_FIELD_TO_COLUMN } from "../queries/derive";

const ROLE_TO_COLUMN: Record<string, RoleColumn> = {
  business_unit: "bu",
  application: "app",
  tier: "tier",
  stage: "stage",
};
import type { DiscoveryRow, RoleColumn } from "../types/discovery";
import type { RoleRegistry } from "../types/registry";
import {
  effectiveEventNameMatch,
  getConditions,
  isException,
  Rule,
} from "../types/rule";

export interface SkippedRule {
  rule_id: string;
  name: string;
  reason: string;
}

export interface Transition {
  /** Current `event.severity` ("1".."5") or null when unset. */
  from: string | null;
  to: string | null;
  count: number;
}

export interface UncoveredEvent {
  eventName: string;
  count: number;
}

export interface SimulationResult {
  totalEvents: number;
  /** Events a Default or Exception matched. */
  matchedEvents: number;
  /** Events whose severity would end up different from today's. */
  changedEvents: number;
  transitions: Transition[];
  /** Event names that no evaluable rule matches (coverage gaps), by volume. */
  uncovered: UncoveredEvent[];
  skippedRules: SkippedRule[];
}

interface EvaluableRule {
  rule: Rule;
  /** [column, expected value] -- "" means "(not set)", which matches a null column. */
  checks: [RoleColumn, string][];
}

function evaluable(
  rules: Rule[],
  registry: RoleRegistry,
): { ok: EvaluableRule[]; skipped: SkippedRule[] } {
  const ok: EvaluableRule[] = [];
  const skipped: SkippedRule[] = [];
  for (const rule of rules) {
    const skip = (reason: string) =>
      skipped.push({ rule_id: rule.rule_id, name: rule.name, reason });
    if (rule.rule_type === "threshold") {
      skip(
        "threshold rule: needs event.description, which the discovery rows don't carry",
      );
      continue;
    }
    if (rule.detector_id !== null) {
      skip(
        "matches on an anomaly detector: discovery rows don't carry dt.settings.object_id",
      );
      continue;
    }
    const checks: [RoleColumn, string][] = [];
    let blocked: string | null = null;
    for (const c of getConditions(rule)) {
      if (c.role === null) continue;
      const def = registry.roles.find((r) => r.role === c.role);
      // Rows built from the Events query are keyed by role (its columns follow the registry's
      // fields); the field map is the fallback for discovery rows, whose fields are fixed.
      const column = def
        ? (ROLE_TO_COLUMN[def.role] ?? KNOWN_FIELD_TO_COLUMN[def.field])
        : undefined;
      if (!column) {
        blocked = `role "${c.role}" maps to a field the discovery query doesn't probe`;
        break;
      }
      checks.push([column, c.value ?? ""]);
    }
    if (blocked) {
      skip(blocked);
      continue;
    }
    ok.push({ rule, checks });
  }
  return { ok, skipped };
}

function matchesRow(e: EvaluableRule, row: DiscoveryRow): boolean {
  const target = e.rule.event_name;
  if (target !== null) {
    const name = row["event.name"];
    const hit =
      effectiveEventNameMatch(e.rule) === "contains"
        ? name.includes(target)
        : name === target;
    if (!hit) return false;
  }
  return e.checks.every(
    ([column, expected]) => (row[column] ?? "") === expected,
  );
}

export function simulate(
  rows: DiscoveryRow[],
  allRules: Rule[],
  registry: RoleRegistry,
): SimulationResult {
  const active = allRules.filter((r) => r.enabled);
  const { ok, skipped } = evaluable(active, registry);

  const defaults = ok.filter((e) => !isException(e.rule));
  const exceptions = ok
    .filter((e) => isException(e.rule))
    .sort((a, b) => (a.rule.order ?? 0) - (b.rule.order ?? 0));

  const fallback = registry.defaultSeverity;
  const transitions = new Map<string, Transition>();
  const uncoveredByName = new Map<string, number>();
  let total = 0;
  let matched = 0;
  let changed = 0;

  for (const row of rows) {
    total += row.c;
    const before = row["event.severity"];

    const defaultHit = defaults.find((e) => matchesRow(e, row));
    let exceptionHit: EvaluableRule | undefined;
    for (const e of exceptions) if (matchesRow(e, row)) exceptionHit = e; // last wins (D20)

    const winner = exceptionHit ?? defaultHit;
    let after: string | null;
    if (winner) {
      after = winner.rule.severity;
      matched += row.c;
    } else {
      after = fallback.mode === "leave" ? before : (fallback.value ?? before);
      uncoveredByName.set(
        row["event.name"],
        (uncoveredByName.get(row["event.name"]) ?? 0) + row.c,
      );
    }

    if (after !== before) changed += row.c;
    const key = `${before ?? ""}>${after ?? ""}`;
    const t = transitions.get(key);
    if (t) t.count += row.c;
    else transitions.set(key, { from: before, to: after, count: row.c });
  }

  return {
    totalEvents: total,
    matchedEvents: matched,
    changedEvents: changed,
    transitions: [...transitions.values()].sort((a, b) => b.count - a.count),
    uncovered: [...uncoveredByName.entries()]
      .map(([eventName, count]) => ({ eventName, count }))
      .sort((a, b) => b.count - a.count),
    skippedRules: skipped,
  };
}
