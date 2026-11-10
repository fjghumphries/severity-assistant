import type { RoleRegistry } from "../types/registry";
import { getConditions, type Rule } from "../types/rule";

/** The rules of one profile, as read from App State. */
export interface ProfileRules {
  profileId: string;
  profileName: string;
  rules: Rule[];
}

export interface LabelImpact {
  profileId: string;
  profileName: string;
  ruleId: string;
  ruleName: string;
  /** Plain-language reason, e.g. 'uses label "Tier", which is removed'. */
  reason: string;
}

/**
 * Which stored rules would stop being valid if `draft` replaced `saved`. Pure: Settings calls it
 * while the user edits, so the warning appears at the moment of the change instead of as a refused
 * deploy later. Rules already invalid under `saved` are not reported -- this is about what the
 * change breaks, not about existing problems.
 */
export function labelImpact(
  saved: RoleRegistry,
  draft: RoleRegistry,
  all: ProfileRules[],
): LabelImpact[] {
  const usable = (r: RoleRegistry) =>
    new Map(
      r.roles
        .filter((x) => x.enabled && x.cardinality === "single")
        .map((x) => [x.role, x.label]),
    );
  const before = usable(saved);
  const after = usable(draft);
  const draftById = new Map(draft.roles.map((r) => [r.role, r]));
  const out: LabelImpact[] = [];

  for (const p of all) {
    for (const rule of p.rules) {
      const conditions = getConditions(rule).filter((c) => c.role !== null);
      const push = (reason: string) =>
        out.push({
          profileId: p.profileId,
          profileName: p.profileName,
          ruleId: rule.rule_id,
          ruleName: rule.name,
          reason,
        });

      for (const c of conditions) {
        const role = c.role as string;
        if (!before.has(role) || after.has(role)) continue;
        const label = before.get(role) as string;
        push(
          draftById.has(role)
            ? `uses label "${label}", which is now disabled`
            : `uses label "${label}", which is removed`,
        );
      }

      if (
        conditions.length > draft.maxConditionsPerRule &&
        conditions.length <= saved.maxConditionsPerRule
      ) {
        push(
          `has ${conditions.length} conditions, more than the new limit of ${draft.maxConditionsPerRule}`,
        );
      }
    }
  }
  return out;
}
