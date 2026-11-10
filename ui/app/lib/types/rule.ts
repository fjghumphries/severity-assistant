/**
 * A single severity rule. The full rule set is stored as one JSON array under the
 * `severity-assistant.rules.v1` App State key. See docs/03-config-store-and-rule-model.md Part
 * 2 and lib/config/useRules.ts.
 *
 * IMPORTANT: an empty string ("" -- matches "tag not set") and null ("this condition slot is
 * unused") are different, meaningful values for `mdN_value` and `event_name` -- never conflate
 * them. Conflating them silently turns a 2-condition rule into a 4-condition rule that matches
 * different events. `JSON.stringify`/`JSON.parse` preserve the distinction natively.
 */

export type RuleType = "keyed" | "threshold";

export type ConditionSlot = 1 | 2 | 3 | 4;

export interface RuleCondition {
  /** A role id from the registry -- never a raw field path. */
  role: string | null;
  /** Expected value. Empty string ("") means "matches events where this role is not set". */
  value: string | null;
}

export interface Rule {
  rule_id: string;
  enabled: boolean;
  name: string;
  rule_type: RuleType;
  /** Exact event.name, or null meaning "any event" (constrained only by its conditions).
   * Mutually exclusive with `detector_id` -- a rule matches on one or the other, never both. */
  event_name: string | null;
  /** The objectId of a `builtin:davis.anomaly-detectors` settings object (see
   * lib/queries/useAnomalyDetectors.ts), matched against `dt.settings.object_id` on the event.
   * Use this instead of `event_name` when the detector's event.name template bakes in a value
   * that can change independently (e.g. a static threshold literal) -- the objectId stays
   * stable across those edits, event.name does not. Mutually exclusive with `event_name`. */
  detector_id: string | null;
  md1_role: string | null;
  md1_value: string | null;
  md2_role: string | null;
  md2_value: string | null;
  md3_role: string | null;
  md3_value: string | null;
  md4_role: string | null;
  md4_value: string | null;
  /** "1".."5" for keyed rules; null for threshold rules. */
  severity: string | null;
  /** DPL pattern for threshold rules; null for keyed rules. */
  parse_pattern: string | null;
  /** Four descending numbers, comma-separated, e.g. "50,20,10,5". Threshold rules only. */
  threshold_bounds: string | null;
  /** How `event_name` is matched. `null`/absent means "exact" -- existing rules predate this
   * field (D19, docs/03 Part 6). "contains" is for provider-native events with genuinely
   * variable text that isn't detector-backed (D18 already covers the detector-backed case). */
  event_name_match: "exact" | "contains" | null;
  /** Explicit, user-controlled position among enabled exceptions -- the last matching exception
   * wins (D20). Required (non-null) on "exceptions" (rules with >=1 role condition, see
   * `isException`); must be null on "defaults" (zero conditions), where ordering has no job --
   * D19 already requires unique targets among defaults, so there is nothing to break ties on. */
  order: number | null;
  updated_at: string;
  updated_by: string;
}

/** A rule stores its conditions in four fixed slots (md1..md4), so four is the hard ceiling. */
export const MAX_CONDITION_SLOTS = 4;

const CONDITION_SLOTS: ConditionSlot[] = [1, 2, 3, 4];

export function getConditions(rule: Rule): RuleCondition[] {
  return CONDITION_SLOTS.map((n) => ({
    role: rule[`md${n}_role` as const],
    value: rule[`md${n}_value` as const],
  }));
}

export function setConditions(rule: Rule, conditions: RuleCondition[]): Rule {
  const next = { ...rule };
  for (const n of CONDITION_SLOTS) {
    const c = conditions[n - 1];
    next[`md${n}_role` as const] = c?.role ?? null;
    next[`md${n}_value` as const] = c?.value ?? null;
  }
  return next;
}

/**
 * D19: every rule already falls into one of two families depending on whether it has role
 * conditions -- a "Default" (target only, zero conditions) or an "Exception" (>=1 role
 * condition). Shared by the UI split (not built here), `validateRule`, and the compiler, so
 * the definition can never drift between them.
 */
export function isException(rule: Rule): boolean {
  return getConditions(rule).some((c) => c.role !== null);
}

/** `event_name_match` defaults to "exact" when null/absent (D19, docs/03 Part 6). */
export function effectiveEventNameMatch(rule: Rule): "exact" | "contains" {
  return rule.event_name_match ?? "exact";
}

export function emptyRule(): Rule {
  return {
    rule_id: "",
    enabled: true,
    name: "",
    rule_type: "keyed",
    event_name: null,
    detector_id: null,
    md1_role: null,
    md1_value: null,
    md2_role: null,
    md2_value: null,
    md3_role: null,
    md3_value: null,
    md4_role: null,
    md4_value: null,
    severity: null,
    parse_pattern: null,
    threshold_bounds: null,
    event_name_match: null,
    order: null,
    updated_at: new Date().toISOString(),
    updated_by: "",
  };
}

/** Generates a stable, sortable, unique rule id. Never reused once assigned (docs/03). */
export function generateRuleId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `r_${Date.now().toString(36)}${rand}`;
}
