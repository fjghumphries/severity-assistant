/**
 * Arranging a profile's rules by what they are about, instead of by what kind of rule they are.
 *
 * A default and the exceptions that override it share a join key -- the event name or anomaly
 * detector they target -- so nesting exceptions under their default needs no new data, only a
 * different arrangement of the same `Rule[]`. Pure, so a large rule set can be arranged and tested
 * without a tenant.
 *
 * Two kinds of exception do not nest under a default and must be shown rather than hidden:
 *  - label-only exceptions (no target), which apply to any event carrying those labels;
 *  - orphans, whose event or detector has no default of its own.
 */

import { isException, Rule } from "../types/rule";

export type TargetKind = "event" | "detector";

export interface TargetGroup {
  /** Stable across renders: `event:<name>` or `detector:<objectId>`. */
  key: string;
  kind: TargetKind;
  /** The event name or the detector's objectId. */
  target: string;
  /** The system-wide default for this target, or null when only exceptions exist (an orphan). */
  default: Rule | null;
  /** Exceptions on this target in their global order, which is also their precedence: the last
   * matching one wins (D20). */
  exceptions: Rule[];
}

export interface RuleTree {
  groups: TargetGroup[];
  /** Exceptions with no target: they apply to any event with matching labels. */
  anyEvent: Rule[];
}

const keyOf = (
  rule: Rule,
): { key: string; kind: TargetKind; target: string } | null => {
  if (rule.detector_id !== null) {
    return {
      key: `detector:${rule.detector_id}`,
      kind: "detector",
      target: rule.detector_id,
    };
  }
  if (rule.event_name !== null) {
    return {
      key: `event:${rule.event_name}`,
      kind: "event",
      target: rule.event_name,
    };
  }
  return null;
};

const byOrder = (a: Rule, b: Rule): number => (a.order ?? 0) - (b.order ?? 0);

/**
 * Groups rules by target. `label` turns a group's target into its display name (a detector's
 * objectId is not readable), and decides the alphabetical order of the groups.
 */
export function groupRules(
  rules: Rule[],
  label: (g: Pick<TargetGroup, "kind" | "target">) => string,
): RuleTree {
  const map = new Map<string, TargetGroup>();
  const anyEvent: Rule[] = [];

  for (const rule of rules) {
    const k = keyOf(rule);
    if (k === null) {
      // A target-less rule is only valid as an exception (a default must name its target).
      if (isException(rule)) anyEvent.push(rule);
      continue;
    }
    const group = map.get(k.key) ?? { ...k, default: null, exceptions: [] };
    if (isException(rule)) group.exceptions.push(rule);
    else group.default = rule;
    map.set(k.key, group);
  }

  const groups = [...map.values()];
  for (const g of groups) g.exceptions.sort(byOrder);
  groups.sort((a, b) => label(a).localeCompare(label(b)));
  return { groups, anyEvent: anyEvent.sort(byOrder) };
}

export interface TreeSummary {
  targets: number;
  withDefault: number;
  /** Targets that carry exceptions but no default of their own. */
  orphans: number;
  exceptions: number;
  anyEvent: number;
}

export function summarizeTree(tree: RuleTree): TreeSummary {
  return {
    targets: tree.groups.length,
    withDefault: tree.groups.filter((g) => g.default !== null).length,
    orphans: tree.groups.filter((g) => g.default === null).length,
    exceptions:
      tree.groups.reduce((n, g) => n + g.exceptions.length, 0) +
      tree.anyEvent.length,
    anyEvent: tree.anyEvent.length,
  };
}

/** Keeps groups where the search text matches the target, or any rule inside it. `matches` decides
 * what "matches a rule" means (name, label values, ...) so this stays free of display concerns. */
export function filterTree(
  tree: RuleTree,
  query: string,
  matchesGroup: (g: TargetGroup) => boolean,
  matchesRule: (r: Rule) => boolean,
): RuleTree {
  if (query.trim() === "") return tree;
  return {
    groups: tree.groups.filter(
      (g) =>
        matchesGroup(g) ||
        (g.default !== null && matchesRule(g.default)) ||
        g.exceptions.some(matchesRule),
    ),
    anyEvent: tree.anyEvent.filter(matchesRule),
  };
}
