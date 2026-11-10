/**
 * "Explain this event": given an event (name or detector) and its label values, which rule wins
 * and why. Pure, and mirrors the compiled semantics (D19/D20): a matching default sets the
 * severity, matching exceptions override it in `order` with the last match winning, and an event
 * nothing touched falls back to the profile's "events with no rule" setting.
 *
 * Label values match case-insensitively and a blank value means "not set", as in the pipeline.
 * Event names match exactly (or by "contains", per rule). Threshold rules read a number from the
 * event text, which is not an input here, so they are reported as undecided, never guessed.
 */

import type { RoleRegistry } from "../types/registry";
import {
  effectiveEventNameMatch,
  getConditions,
  isException,
  type Rule,
} from "../types/rule";

export interface ExplainInput {
  eventName: string;
  /** objectId of the anomaly detector the event came from, when the rules key on one. */
  detectorId: string | null;
  /** Label values by role id. A missing or blank entry means the label is not set on the event. */
  labels: Record<string, string>;
}

export interface ExplainLine {
  rule: Rule;
  /** What the rule would give this event, when it matches. */
  matches: boolean;
  /** Plain-language reason it matched, or the first thing that did not. */
  reason: string;
}

export type ExplainSource = "exception" | "default" | "no-rule";

export interface Explanation {
  /** The severity the event would get, or null when it keeps what it arrived with. */
  severity: string | null;
  source: ExplainSource;
  winner: Rule | null;
  /** The matching default, shown even when an exception overrides it. */
  default: ExplainLine | null;
  /** Every enabled exception whose target fits, in order, with whether its conditions held. */
  exceptions: ExplainLine[];
  /** Threshold rules that could change the answer; not evaluated. */
  undecided: Rule[];
  /** One sentence for the headline. */
  summary: string;
}

const labelOf = (registry: RoleRegistry, role: string): string =>
  registry.roles.find((r) => r.role === role)?.label ?? role;

function targetFits(rule: Rule, input: ExplainInput): string | null {
  if (rule.event_name !== null) {
    const hit =
      effectiveEventNameMatch(rule) === "contains"
        ? input.eventName.includes(rule.event_name)
        : input.eventName === rule.event_name;
    return hit ? null : `the event name is not "${rule.event_name}"`;
  }
  if (rule.detector_id !== null) {
    return input.detectorId === rule.detector_id
      ? null
      : "it comes from a different anomaly detector";
  }
  return null;
}

function evaluate(
  rule: Rule,
  input: ExplainInput,
  registry: RoleRegistry,
): ExplainLine {
  const miss = targetFits(rule, input);
  if (miss) return { rule, matches: false, reason: miss };

  const parts: string[] = [];
  for (const c of getConditions(rule)) {
    if (c.role === null) continue;
    const label = labelOf(registry, c.role);
    const have = input.labels[c.role] ?? "";
    const want = c.value ?? "";
    const ok =
      want === ""
        ? have === ""
        : have.toLowerCase() === want.toLowerCase() && have !== "";
    if (!ok) {
      return {
        rule,
        matches: false,
        reason:
          want === ""
            ? `${label} is set (${have}), the rule needs it empty`
            : have === ""
              ? `${label} is not set, the rule needs ${want}`
              : `${label} is ${have}, the rule needs ${want}`,
      };
    }
    parts.push(want === "" ? `${label} is not set` : `${label} = ${want}`);
  }
  return {
    rule,
    matches: true,
    reason: parts.length > 0 ? parts.join(" and ") : "applies to this event",
  };
}

export function explain(
  rules: Rule[],
  registry: RoleRegistry,
  input: ExplainInput,
): Explanation {
  const active = rules.filter((r) => r.enabled);
  const keyed = (r: Rule) => r.rule_type === "keyed";

  const undecided = active
    .filter((r) => !keyed(r))
    .filter((r) => evaluate(r, input, registry).matches);

  const defLine =
    active
      .filter((r) => keyed(r) && !isException(r))
      .map((r) => evaluate(r, input, registry))
      .find((l) => l.matches) ?? null;

  const excLines = active
    .filter((r) => keyed(r) && isException(r))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((r) => evaluate(r, input, registry))
    // An exception whose target does not fit the event is not worth listing.
    .filter(
      (l) => l.matches || !/^the event name|^it comes from/.test(l.reason),
    );

  const winnerLine = [...excLines].reverse().find((l) => l.matches) ?? null;

  let severity: string | null;
  let source: ExplainSource;
  let winner: Rule | null;
  if (winnerLine) {
    severity = winnerLine.rule.severity;
    source = "exception";
    winner = winnerLine.rule;
  } else if (defLine) {
    severity = defLine.rule.severity;
    source = "default";
    winner = defLine.rule;
  } else {
    const f = registry.defaultSeverity;
    severity = f.mode === "leave" ? null : (f.value ?? null);
    source = "no-rule";
    winner = null;
  }

  const summary =
    source === "exception"
      ? `Severity ${severity}: the exception "${winner?.name}" wins.`
      : source === "default"
        ? `Severity ${severity}: the default "${winner?.name}" applies, and no exception matches.`
        : severity === null
          ? "No rule matches, so the event keeps the severity it arrived with."
          : `No rule matches, so it gets the "events with no rule" severity ${severity}.`;

  return {
    severity,
    source,
    winner,
    default: defLine,
    exceptions: excLines,
    undecided,
    summary,
  };
}
