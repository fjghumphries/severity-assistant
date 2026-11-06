import { compile } from "../compiler";
import { emptyRule, Rule, setConditions } from "../types/rule";
import { RoleRegistry } from "../types/registry";
import {
  describeChangeLine,
  summarizePlan,
  type ChangeSummary,
} from "./describe";
import { buildDeployPlan, type LivePipelineValue } from "./plan";

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
  ],
  defaultSeverity: { mode: "leave" },
  routeMatcher: "true",
  pipelineCustomId: "p",
} as unknown as RoleRegistry;

const base = { ...emptyRule(), updated_by: "t" };
const rules: Rule[] = [
  {
    ...base,
    rule_id: "r_a",
    name: "Foo default",
    event_name: "Foo",
    severity: "2",
  },
  setConditions(
    {
      ...base,
      rule_id: "r_b",
      name: "Foo for bu1",
      event_name: "Foo",
      severity: "1",
      order: 0,
    },
    [{ role: "business_unit", value: "bu1" }],
  ),
];

it("describes a first deploy in rule terms", () => {
  const c = compile(rules, registry);
  if (!c.ok) throw new Error("compile failed");
  const plan = buildDeployPlan(c.pipeline, null);
  const s = summarizePlan(plan, null, {
    rules,
    registry,
    detectorName: () => undefined,
  });
  expect(s.defaults).toEqual([
    { tone: "added", title: 'Event "Foo"', detail: "severity 2" },
  ]);
  expect(s.exceptions).toHaveLength(1);
  expect(s.exceptions[0].title).toBe("#0 Foo for bu1");
  expect(s.exceptions[0].detail).toBe(
    'Event is "Foo", Business Unit = bu1 -> severity 1',
  );
});

const emptySummary = (): ChangeSummary => ({
  defaults: [],
  exceptions: [],
  thresholds: [],
  security: [],
  internalChanged: false,
  settings: [],
  orderChanged: false,
});

test("describeChangeLine names rule-level changes", () => {
  const s = emptySummary();
  s.exceptions = [
    { tone: "changed", title: "#0 A" },
    { tone: "changed", title: "#1 B" },
    { tone: "added", title: "#2 C" },
  ];
  s.defaults = [{ tone: "removed", title: 'Event "Foo"' }];
  expect(describeChangeLine(s)).toBe(
    '1 default removed (Event "Foo"); 1 exception added (#2 C); 2 exceptions changed (#0 A, #1 B)',
  );
});

test("describeChangeLine falls back when nothing rule-level changed", () => {
  expect(describeChangeLine(emptySummary())).toBe("no rule-level changes");
  expect(describeChangeLine({ ...emptySummary(), orderChanged: true })).toBe(
    "exception order changed",
  );
});

/** The exception processor id carries the rule id and NOT its order, so moving a rule up or down
 * must read as a reorder of the same processors -- not as removing and re-adding every rule whose
 * position shifted. Guards the id scheme in buildExceptionProcessor. */
it("treats a pure reorder as a reorder, not remove + add", () => {
  const second = setConditions(
    {
      ...base,
      rule_id: "r_c",
      name: "Foo for bu2",
      event_name: "Foo",
      severity: "4",
      order: 1,
    },
    [{ role: "business_unit", value: "bu2" }],
  );
  const before = compile([...rules, second], registry);
  const swapped = [
    ...rules.map((r) => (r.order === 0 ? { ...r, order: 1 } : r)),
    { ...second, order: 0 },
  ];
  const after = compile(swapped, registry);
  if (!before.ok || !after.ok) throw new Error("compile failed");

  const live = {
    objectId: "o",
    updateToken: "t",
    value: before.pipeline as unknown as LivePipelineValue,
  };
  const plan = buildDeployPlan(after.pipeline, live);

  expect(plan.added).toEqual([]);
  expect(plan.removed).toEqual([]);
  expect(plan.orderChanged).toBe(true);

  const s = summarizePlan(plan, live, {
    rules: swapped,
    registry,
    detectorName: () => undefined,
  });
  expect(describeChangeLine(s)).toContain("exception order changed");
});
