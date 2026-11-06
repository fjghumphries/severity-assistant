import type { Profile, RoleDefinition } from "../lib/types/registry";
import { emptyRule, type Rule } from "../lib/types/rule";

/** DEBUG-ONLY test data. Pure: no SDK imports, so it is unit-tested without a tenant. */

export const TEST_PROFILE_ID = "sa-test";
export const TEST_EVENT_PREFIX = "SATEST-";

/**
 * Role id -> the event field it reads. If the ingest spike shows `primary_tags.*` cannot be set
 * from a payload, change the two values here to plain keys (e.g. "sa_bu") and re-seed; the rules
 * reference roles, so nothing else moves.
 */
export const FIELD_MAP = {
  business_unit: "primary_tags.bu",
  application: "primary_tags.landscape",
  tier: "primary_tags.tier",
  stage: "primary_tags.stage",
} as const;

export const testRoles = (): RoleDefinition[] => [
  { role: "business_unit", label: "Business Unit", field: FIELD_MAP.business_unit, cardinality: "single", enabled: true },
  { role: "application", label: "Application", field: FIELD_MAP.application, cardinality: "single", enabled: true },
  { role: "tier", label: "Tier", field: FIELD_MAP.tier, cardinality: "single", enabled: true },
  { role: "stage", label: "Stage", field: FIELD_MAP.stage, cardinality: "single", enabled: true },
];

/** Narrow matcher, fallback "flag 5" so unmatched events are visible via sa.unmatched. */
export const testProfile = (): Profile => ({
  id: TEST_PROFILE_ID,
  name: "SA Test",
  pipelineCustomId: "pipeline_severity_assistant_sa_test",
  routeMatcher: `matchesValue(event.name, "${TEST_EVENT_PREFIX}*")`,
  defaultSeverity: { mode: "flag", value: "5" },
  securityContext: { mode: "none" },
});

const NOW = "2026-01-01T00:00:00.000Z";

const base = (id: string, name: string, patch: Partial<Rule>): Rule => ({
  ...emptyRule(),
  rule_id: id,
  name,
  updated_at: NOW,
  updated_by: "debug-seed",
  ...patch,
});

const def = (id: string, target: string, severity: string): Rule =>
  base(id, `${target} default`, { event_name: target, severity });

const exc = (
  id: string,
  target: string,
  order: number,
  conditions: [string, string | null][],
  severity: string,
): Rule => {
  const patch: Partial<Rule> = { event_name: target, severity, order };
  conditions.forEach(([role, value], i) => {
    Object.assign(patch, { [`md${i + 1}_role`]: role, [`md${i + 1}_value`]: value });
  });
  return base(id, `${target} exception ${order}`, patch);
};

/** The rule matrix from docs/12-test-cycle.md. Exception order is dense from 0. */
export const testRules = (): Rule[] => [
  def("dbg-def-a", "SATEST-DEFAULT", "3"),
  def("dbg-def-b", "SATEST-OVERRIDE", "2"),
  def("dbg-def-c", "SATEST-MULTI", "3"),
  def("dbg-def-d", "SATEST-NULLTAG", "3"),
  base("dbg-def-e", "SATEST-THRESHOLD default", {
    rule_type: "threshold",
    event_name: "SATEST-THRESHOLD",
    parse_pattern: "DATA 'increased to 'INT:sa_v",
    threshold_bounds: "50,20,10,5",
  }),
  // OVERRIDE: exc-2 overlaps exc-0 (it adds a tier condition), so an event with bu1 + bronze matches
  // both and the later one must win (D20). Identical conditions are rejected by the app by design.
  exc("dbg-exc-0", "SATEST-OVERRIDE", 0, [["business_unit", "bu1"]], "1"),
  exc("dbg-exc-1", "SATEST-OVERRIDE", 1, [["business_unit", "bu2"]], "5"),
  exc("dbg-exc-2", "SATEST-OVERRIDE", 2, [["business_unit", "bu1"], ["tier", "bronze"]], "4"),
  exc("dbg-exc-3", "SATEST-MULTI", 3, [["business_unit", "bu1"], ["tier", "bronze"]], "1"),
  exc("dbg-exc-4", "SATEST-NULLTAG", 4, [["business_unit", ""]], "2"),
];

export interface FixtureCase {
  id: string;
  title: string;
  properties: Record<string, string>;
  expectSeverity: string;
  expectSource: "default" | "exception" | "unmatched";
}

const tags = (bu?: string, tier?: string): Record<string, string> => {
  const p: Record<string, string> = {};
  if (bu !== undefined) p[FIELD_MAP.business_unit] = bu;
  if (tier !== undefined) p[FIELD_MAP.tier] = tier;
  return p;
};

/** One event per behaviour. Thresholds: >=50 -> 1, >=20 -> 2, >=10 -> 3, >=5 -> 4, else 5. */
export const fixtureCases: FixtureCase[] = [
  { id: "C1", title: "SATEST-DEFAULT", properties: {}, expectSeverity: "3", expectSource: "default" },
  { id: "C2", title: "SATEST-OVERRIDE", properties: tags("bu1"), expectSeverity: "1", expectSource: "exception" },
  { id: "C3", title: "SATEST-OVERRIDE", properties: tags("bu1", "bronze"), expectSeverity: "4", expectSource: "exception" },
  { id: "C4", title: "SATEST-OVERRIDE", properties: tags("bu2"), expectSeverity: "5", expectSource: "exception" },
  { id: "C5", title: "SATEST-OVERRIDE", properties: tags("bu9"), expectSeverity: "2", expectSource: "default" },
  { id: "C6", title: "SATEST-MULTI", properties: tags("bu1", "bronze"), expectSeverity: "1", expectSource: "exception" },
  { id: "C7", title: "SATEST-MULTI", properties: tags("bu1", "gold"), expectSeverity: "3", expectSource: "default" },
  { id: "C8", title: "SATEST-NULLTAG", properties: {}, expectSeverity: "2", expectSource: "exception" },
  { id: "C9", title: "SATEST-THRESHOLD", properties: { "event.description": "Failure rate increased to 85%" }, expectSeverity: "1", expectSource: "default" },
  { id: "C10", title: "SATEST-THRESHOLD", properties: { "event.description": "Failure rate increased to 7%" }, expectSeverity: "4", expectSource: "default" },
  { id: "C11", title: "SATEST-UNMATCHED", properties: {}, expectSeverity: "5", expectSource: "unmatched" },
];

/** The ingest body for one case. `sa.run_id` makes every run's assertions independent. */
export function ingestBody(c: FixtureCase, runId: string) {
  return {
    eventType: "CUSTOM_INFO",
    title: c.title,
    properties: { ...c.properties, "sa.fixture": "true", "sa.run_id": runId, "sa.case": c.id },
  };
}
