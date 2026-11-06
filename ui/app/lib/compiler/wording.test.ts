import { RoleRegistry } from "../types/registry";
import { emptyRule, setConditions } from "../types/rule";
import {
  buildExceptionProcessor,
  buildDefaultThresholdProcessor,
} from "./processors";
import { describeBands, describeTarget, describeWhen } from "./wording";

const registry = {
  maxConditionsPerRule: 4,
  roles: [
    {
      role: "business_unit",
      label: "Business Unit",
      field: "primary_tags.bu",
      cardinality: "single",
      enabled: true,
    },
    {
      role: "tier",
      label: "Tier",
      field: "primary_tags.tier",
      cardinality: "single",
      enabled: true,
    },
  ],
  defaultSeverity: { mode: "flag", value: "5" },
} as unknown as RoleRegistry;

const threshold = {
  ...emptyRule(),
  rule_id: "t1",
  name: "T",
  rule_type: "threshold" as const,
  event_name: "SATEST-THRESHOLD",
  parse_pattern: "DATA 'x 'INT:sa_v",
  threshold_bounds: "50,20,10,5",
};

test("target, conditions and bands read in plain language", () => {
  expect(describeTarget(threshold)).toBe('events named "SATEST-THRESHOLD"');
  expect(describeTarget({ ...threshold, event_name_match: "contains" })).toBe(
    'events whose name contains "SATEST-THRESHOLD"',
  );
  const exc = setConditions({ ...emptyRule(), event_name: "Foo" }, [
    { role: "business_unit", value: "bu1" },
    { role: "tier", value: "" },
  ]);
  expect(describeWhen(exc, registry)).toBe(
    " when Business Unit = bu1 and Tier is not set",
  );
  expect(describeBands(threshold)).toBe(
    ">=50 -> 1, >=20 -> 2, >=10 -> 3, >=5 -> 4, else 5",
  );
});

test("processor descriptions say what the processor does", () => {
  expect(buildDefaultThresholdProcessor(threshold, registry).description).toBe(
    'Severity Assistant: set default severity for events named "SATEST-THRESHOLD", from a number in the event description (>=50 -> 1, >=20 -> 2, >=10 -> 3, >=5 -> 4, else 5)',
  );
  const exc = setConditions(
    {
      ...emptyRule(),
      rule_id: "e1",
      name: "E",
      event_name: "Foo",
      severity: "1",
      order: 2,
    },
    [{ role: "business_unit", value: "bu1" }],
  );
  expect(buildExceptionProcessor(exc, registry).description).toBe(
    'Severity Assistant: exception #2 - set severity 1 for events named "Foo" when Business Unit = bu1',
  );
});
