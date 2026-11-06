/**
 * Turning the rule editor's form values into a `Rule`, and the list edits around it. Pure and free
 * of React and the SDK, so the rules that decide what reaches the pipeline -- which fields a
 * default may carry, how an exception is ordered, what is rejected -- are unit-tested rather than
 * living inside a component.
 *
 * Shared by defaults and exceptions: they differ only in whether label conditions are present
 * (D19) and whether the rule takes a place in the global exception order (D20).
 */

import {
  findDuplicateDefaultTargets,
  validateRule,
} from "../config/validateRule";
import type { RoleRegistry } from "../types/registry";
import {
  emptyRule,
  generateRuleId,
  isException,
  Rule,
  RuleCondition,
  RuleType,
  setConditions,
} from "../types/rule";

export type RuleKind = "default" | "exception";
export type MatchMode = "event" | "detector";

export interface FormValues {
  kind: RuleKind;
  /** Typed name; blank means derive one from the target and conditions. */
  name: string;
  matchMode: MatchMode;
  eventName: string;
  detectorId: string | null;
  ruleType: RuleType;
  severity: string;
  parsePattern: string;
  /** Already joined ("50,20,10,5"). */
  thresholdBounds: string;
  conditions: RuleCondition[];
}

export interface BuildArgs {
  values: FormValues;
  /** The rule being edited, or undefined when adding. */
  base?: Rule;
  /** The whole rule set, to place an exception in the order and to detect a clash. */
  rules: Rule[];
  registry: RoleRegistry;
  /** Builds the display name when none was typed (it needs the detector's readable name). */
  deriveName: (target: { values: FormValues; candidate: Rule }) => string;
  now: Date;
  userEmail: string;
}

export type BuildResult =
  { ok: true; candidate: Rule; next: Rule[] } | { ok: false; issues: string[] };

/** The next free place at the end of the exception order (the order is dense from 0, D20). */
export function nextExceptionOrder(rules: Rule[]): number {
  const orders = rules
    .filter(isException)
    .map((r) => r.order)
    .filter((o): o is number => o !== null);
  return orders.length > 0 ? Math.max(...orders) + 1 : 0;
}

export function buildCandidate(args: BuildArgs): BuildResult {
  const { values, base, rules, registry } = args;
  const isDefault = values.kind === "default";

  const usedConditions = isDefault
    ? []
    : values.conditions
        .filter((c) => c.role !== null)
        .map((c) => ({ role: c.role, value: c.value ?? "" }));

  if (!isDefault && usedConditions.length < 1) {
    return {
      ok: false,
      issues: [
        "An exception needs at least one label condition (otherwise it is a default).",
      ],
    };
  }

  const severityFields =
    values.ruleType === "threshold"
      ? {
          severity: null,
          parse_pattern: values.parsePattern.trim() || null,
          threshold_bounds: values.thresholdBounds,
        }
      : {
          severity: values.severity,
          parse_pattern: null,
          threshold_bounds: null,
        };

  let candidate: Rule = {
    ...emptyRule(),
    ...(base ?? {}),
    rule_id: base?.rule_id ?? generateRuleId(),
    rule_type: values.ruleType,
    event_name:
      values.matchMode === "event" && values.eventName.trim() !== ""
        ? values.eventName.trim()
        : null,
    detector_id: values.matchMode === "detector" ? values.detectorId : null,
    ...severityFields,
    updated_at: args.now.toISOString(),
    updated_by: args.userEmail,
  };
  candidate = setConditions(candidate, usedConditions);
  candidate = {
    ...candidate,
    name: args.deriveName({ values, candidate }),
    // A default sits outside the exception order; an exception keeps its place when edited and
    // joins the end when new.
    order: isDefault ? null : (base?.order ?? nextExceptionOrder(rules)),
  };

  const issues = validateRule(candidate, registry).map((i) => i.message);
  if (issues.length > 0) return { ok: false, issues };

  const next = base
    ? rules.map((r) => (r.rule_id === base.rule_id ? candidate : r))
    : [...rules, candidate];

  // Two defaults on one target contradict each other. The list view used to only report this after
  // the fact; here it stops the save.
  if (isDefault) {
    const clash = findDuplicateDefaultTargets(next);
    if (clash.length > 0)
      return { ok: false, issues: clash.map((c) => c.message) };
  }

  return { ok: true, candidate, next };
}

/**
 * Swaps two exceptions' places in the global order. Exchanging two existing integers keeps the
 * order dense and unique (D20) without renumbering anything else.
 */
export function swapOrder(rules: Rule[], aId: string, bId: string): Rule[] {
  const a = rules.find((r) => r.rule_id === aId);
  const b = rules.find((r) => r.rule_id === bId);
  if (!a || !b) return rules;
  return rules.map((r) => {
    if (r.rule_id === aId) return { ...r, order: b.order };
    if (r.rule_id === bId) return { ...r, order: a.order };
    return r;
  });
}

/**
 * Removes a rule. Deleting an exception leaves a gap in the dense order, which validation rejects
 * (D20), so the remaining exceptions are renumbered from 0 keeping their relative order.
 */
export function removeRule(rules: Rule[], ruleId: string): Rule[] {
  const remaining = rules.filter((r) => r.rule_id !== ruleId);
  const exceptions = remaining
    .filter(isException)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const renumbered = new Map(exceptions.map((r, i) => [r.rule_id, i]));
  return remaining.map((r) =>
    renumbered.has(r.rule_id)
      ? { ...r, order: renumbered.get(r.rule_id) ?? null }
      : r,
  );
}
