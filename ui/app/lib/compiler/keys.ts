/**
 * Shared key/matcher-building primitives -- one implementation used by both the Default key
 * builder (Phase 0/2) and the Exception matchers (Phase 3), so the two sides can never drift
 * (docs/03-config-store-and-rule-model.md Part 3 point 6).
 */

import { getConditions, Rule } from "../types/rule";
import { RoleRegistry } from "../types/registry";

export type TargetFamily = "EVT" | "DET";

export interface RuleTarget {
  family: TargetFamily;
  /** The Grail field the target is matched against. */
  field: string;
  /** The literal value (event name or detector objectId) this rule's target must equal/contain. */
  value: string;
}

/**
 * A rule's target, or `null` for a target-less "any event" rule. Only Exceptions may omit a
 * target (D19 requires every Default to have one -- enforced by `validateRule`, not here).
 */
export function ruleTarget(rule: Rule): RuleTarget | null {
  if (rule.event_name !== null) {
    return { family: "EVT", field: "event.name", value: rule.event_name };
  }
  if (rule.detector_id !== null) {
    return {
      family: "DET",
      field: "dt.settings.object_id",
      value: rule.detector_id,
    };
  }
  return null;
}

function roleField(role: string, registry: RoleRegistry): string {
  const def = registry.roles.find((r) => r.role === role);
  if (!def) {
    // Should never happen for a validated rule set -- validateRule already rejects a rule
    // referencing a role absent from the registry (D9b) before the compiler ever builds
    // expressions from it.
    throw new Error(
      `compiler: role "${role}" not found in registry -- validate before compiling`,
    );
  }
  return def.field;
}

/**
 * A rule's role conditions, sorted by role id lexicographically (docs/03 Part 3, point 1) --
 * NOT by registry precedence (point 7). Authoring order must never affect the result, and
 * sorting by role rather than by field is what makes this survive a role remap unchanged.
 */
export function sortedConditions(
  rule: Rule,
): { role: string; value: string | null }[] {
  return getConditions(rule)
    .filter((c): c is { role: string; value: string | null } => c.role !== null)
    .sort((a, b) => a.role.localeCompare(b.role));
}

/** Escapes a string for embedding as a double-quoted DQL string literal. */
export function dqlStringLiteral(value: string): string {
  return JSON.stringify(value);
}

/**
 * The `matcher` expression for a rule's target + role conditions, ANDed together in role-id
 * sort order (docs/04 Phase 3's exception-processor shape; also used for a Default threshold
 * processor's matcher, which is the same shape minus role conditions). Returns `"true"` only if
 * the rule has neither a target nor any conditions, which a validated rule set never produces.
 */
export function buildMatcher(rule: Rule, registry: RoleRegistry): string {
  const clauses: string[] = [];
  const target = ruleTarget(rule);
  if (target) {
    const matchMode = rule.event_name_match ?? "exact";
    if (target.family === "EVT" && matchMode === "contains") {
      // `contains()` is not enabled in matchers (validated against the tenant, 2026-10-23);
      // matchesValue with wildcards is the equivalent.
      clauses.push(
        `matchesValue(${target.field}, ${dqlStringLiteral(`*${target.value}*`)})`,
      );
    } else {
      clauses.push(`${target.field}==${dqlStringLiteral(target.value)}`);
    }
  }
  for (const c of sortedConditions(rule)) {
    // Matchers allow only a restricted function set: `arrayFirst()` and `contains()` are
    // rejected on save (docs/11), so the key builder's arrayFirst/coalesce normalisation cannot
    // be used here. `matchesValue` matches a scalar or any element of an array field.
    const field = roleField(c.role, registry);
    const value = c.value ?? "";
    if (value === "") {
      // "(not set)": an absent tag is null, and `null == ""` is not true (2026-10-22).
      clauses.push(`(isNull(${field}) or ${field}=="")`);
    } else {
      clauses.push(`matchesValue(${field}, ${dqlStringLiteral(value)})`);
    }
  }
  return clauses.length > 0 ? clauses.join(" and ") : "true";
}
