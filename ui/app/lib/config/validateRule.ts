import { getConditions, isException, Rule } from "../types/rule";
import { RoleRegistry } from "../types/registry";

export interface ValidationIssue {
  field: string;
  message: string;
}

const SEVERITY_RE = /^[1-5]$/;

/**
 * Per-rule validation, run before every save. Mirrors the rule-level rows of the validation
 * table in docs/04-pipeline-compiler-spec.md. Compiler-level checks (processor/byte budgets,
 * signature counts, matcher/script length) live with the compiler in Phase 3, not here.
 */
export function validateRule(
  rule: Rule,
  registry: RoleRegistry,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const prefix = rule.name || rule.rule_id || "(unnamed rule)";

  if (!rule.name.trim()) {
    issues.push({ field: "name", message: `${prefix}: name cannot be empty.` });
  }

  if (rule.event_name !== null && rule.event_name.includes("|")) {
    issues.push({
      field: "event_name",
      message: `${prefix}: event name cannot contain "|" -- it corrupts the composite key.`,
    });
  }

  if (rule.event_name !== null && rule.detector_id !== null) {
    issues.push({
      field: "event_name",
      message: `${prefix}: cannot match on both an event name and a detector -- pick one (a detector's event.name can bake in a value, like a static threshold, that changes independently of the detector itself).`,
    });
  }

  const conditions = getConditions(rule).filter((c) => c.role !== null);
  const hasTarget = rule.event_name !== null || rule.detector_id !== null;

  // Zero conditions is allowed when event_name/detector_id pins the rule to a specific event
  // ("this event is always severity 1", cascading-specificity base case in
  // docs/04-pipeline-compiler-spec.md -- a valid signature with zero roles). Zero conditions AND
  // no target would match every event tenant-wide, which is what the registry's
  // `defaultSeverity` setting is for instead.
  if (conditions.length < 1 && !hasTarget) {
    issues.push({
      field: "conditions",
      message: `${prefix}: needs at least one condition, an event name, or a detector -- a rule with none of those would match every event, which is what "When no rule matches" in Settings is for.`,
    });
  }
  if (conditions.length > registry.maxConditionsPerRule) {
    issues.push({
      field: "conditions",
      message: `${prefix}: has ${conditions.length} conditions, more than the configured max of ${registry.maxConditionsPerRule}.`,
    });
  }

  // D20: exceptions (>=1 role condition) must carry an explicit order; defaults (zero
  // conditions) must not -- ordering has no job to do there since D19 already requires unique
  // targets among defaults. `conditions.length > 0` is equivalent to `isException(rule)` here
  // since `conditions` is already filtered to `role !== null`.
  const exceptionByConditions = conditions.length > 0;
  if (exceptionByConditions && rule.order === null) {
    issues.push({
      field: "order",
      message: `${prefix}: exceptions (rules with at least one condition) must have an order (D20) so ties among exceptions resolve deterministically.`,
    });
  }
  if (!exceptionByConditions && rule.order !== null) {
    issues.push({
      field: "order",
      message: `${prefix}: only exceptions are ordered (D20) -- a default (zero conditions) must not set an order.`,
    });
  }

  const seenRoles = new Set<string>();
  for (const c of conditions) {
    if (c.role === null) continue;
    if (seenRoles.has(c.role)) {
      issues.push({
        field: "conditions",
        message: `${prefix}: role "${c.role}" is used more than once.`,
      });
    }
    seenRoles.add(c.role);

    const roleDef = registry.roles.find((r) => r.role === c.role);
    if (!roleDef) {
      issues.push({
        field: "conditions",
        message: `${prefix}: references role "${c.role}", which no longer exists in the registry (orphaned rule).`,
      });
    } else {
      if (!roleDef.enabled) {
        issues.push({
          field: "conditions",
          message: `${prefix}: role "${roleDef.label}" is disabled in Settings.`,
        });
      }
      if (roleDef.cardinality !== "single") {
        issues.push({
          field: "conditions",
          message: `${prefix}: role "${roleDef.label}" is multi-value and cannot be used in a rule (D10).`,
        });
      }
    }

    if (c.value !== null && c.value.includes("|")) {
      issues.push({
        field: "conditions",
        message: `${prefix}: value for role "${c.role}" cannot contain "|" -- it corrupts the composite key.`,
      });
    }
  }

  if (rule.rule_type === "keyed") {
    if (!rule.severity || !SEVERITY_RE.test(rule.severity)) {
      issues.push({
        field: "severity",
        message: `${prefix}: severity must be a string "1" through "5".`,
      });
    }
    if (rule.parse_pattern || rule.threshold_bounds) {
      issues.push({
        field: "rule_type",
        message: `${prefix}: keyed rules must not set parse_pattern or threshold_bounds.`,
      });
    }
  } else {
    if (!rule.parse_pattern?.trim()) {
      issues.push({
        field: "parse_pattern",
        message: `${prefix}: threshold rules need a parse pattern.`,
      });
    }
    if (rule.severity !== null) {
      issues.push({
        field: "severity",
        message: `${prefix}: threshold rules must not set a fixed severity.`,
      });
    }
    const bounds = (rule.threshold_bounds ?? "")
      .split(",")
      .map((s) => s.trim());
    if (
      bounds.length !== 4 ||
      bounds.some((b) => b === "" || Number.isNaN(Number(b)))
    ) {
      issues.push({
        field: "threshold_bounds",
        message: `${prefix}: threshold_bounds must be exactly 4 comma-separated numbers.`,
      });
    } else {
      const nums = bounds.map(Number);
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] >= nums[i - 1]) {
          issues.push({
            field: "threshold_bounds",
            message: `${prefix}: threshold_bounds must be strictly descending (got "${rule.threshold_bounds}").`,
          });
          break;
        }
      }
    }
  }

  return issues;
}

/**
 * Cross-rule check: two enabled rules with the identical event_name and identical condition
 * set (same roles, same values) are a direct conflict -- whichever the compiler processes
 * last wins, silently. This is a simplified check; full signature/key equivalence (accounting
 * for role remaps, "(not set)" values, etc.) is compiler-level work in Phase 3.
 */
export function findDuplicateRules(rules: Rule[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, string>();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const conditions = getConditions(rule)
      .filter((c) => c.role !== null)
      .map((c) => `${c.role}=${c.value ?? ""}`)
      .sort()
      .join("&");
    const target =
      rule.event_name ??
      (rule.detector_id !== null ? `detector:${rule.detector_id}` : "<any>");
    const key = `${target}::${conditions}`;

    const existing = seen.get(key);
    if (existing) {
      issues.push({
        field: "conditions",
        message: `"${rule.name}" and "${existing}" match the exact same event and conditions -- only one will take effect.`,
      });
    } else {
      seen.set(key, rule.name);
    }
  }

  return issues;
}

/**
 * D19: no two enabled Defaults (zero role conditions) may share the same target
 * (`event_name`/`detector_id`). The compiler's Phase 2.5 combiner
 * (`docs/04-pipeline-compiler-spec.md`) assumes at most one Default result per target --
 * violating this makes that assumption unsafe.
 */
export function findDuplicateDefaultTargets(rules: Rule[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, string>();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (isException(rule)) continue;

    const target =
      rule.event_name !== null
        ? `event:${rule.event_name}`
        : rule.detector_id !== null
          ? `detector:${rule.detector_id}`
          : "<any>";

    const existing = seen.get(target);
    if (existing) {
      issues.push({
        field: "conditions",
        message: `"${rule.name}" and "${existing}" are both Defaults for the same target (${target}) -- Defaults must have a unique target (D19).`,
      });
    } else {
      seen.set(target, rule.name);
    }
  }

  return issues;
}

/**
 * D20: enabled exceptions (rules with at least one role condition) carry an explicit, unique,
 * dense `order` -- unique so "which one wins" is never ambiguous, dense (no gaps, starting at
 * 0) so the Exceptions screen's drag-to-reorder can always write a clean new sequence.
 */
export function findExceptionOrderConflicts(rules: Rule[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const enabledExceptions = rules.filter((r) => r.enabled && isException(r));

  const seen = new Map<number, string>();
  for (const rule of enabledExceptions) {
    if (rule.order === null) continue; // reported per-rule by validateRule already
    const existing = seen.get(rule.order);
    if (existing) {
      issues.push({
        field: "order",
        message: `"${rule.name}" and "${existing}" both have order ${rule.order} -- order must be unique among exceptions (D20).`,
      });
    } else {
      seen.set(rule.order, rule.name);
    }
  }

  const orders = [
    ...new Set(
      enabledExceptions
        .map((r) => r.order)
        .filter((o): o is number => o !== null),
    ),
  ].sort((a, b) => a - b);
  const dense = orders.every((v, i) => v === i);
  if (orders.length > 0 && !dense) {
    issues.push({
      field: "order",
      message: `Exception order values must be dense, starting at 0 with no gaps (got: ${orders.join(", ")}).`,
    });
  }

  return issues;
}
