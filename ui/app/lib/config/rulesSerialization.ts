import { emptyRule, Rule } from "../types/rule";

/**
 * Normalises one stored rule record into a `Rule`. Guards against a record from an older
 * schema revision (fewer keys) surfacing missing fields as `undefined` -- and `undefined` vs
 * `null` vs `""` is exactly the distinction this schema depends on (docs/03, Part 2: `""` means
 * "matches not-set", `null` means "condition slot unused"). Treat "missing" the same as
 * "explicitly null", never coerce to `""`.
 *
 * Storage itself is a single `JSON.stringify`d array under the rules App State key
 * (`useRules.ts`), which already preserves `null`/`""` distinctly -- this normalisation exists
 * for forward/backward schema compatibility, not to work around the storage format.
 */
const RULE_KEYS = Object.keys(emptyRule()) as (keyof Rule)[];

export function normalizeRuleRecord(record: Record<string, unknown>): Rule {
  const rule = { ...emptyRule() } as Record<string, unknown>;
  for (const key of RULE_KEYS) {
    if (key in record && record[key] !== undefined) {
      rule[key] = record[key];
    }
  }
  return rule as unknown as Rule;
}
