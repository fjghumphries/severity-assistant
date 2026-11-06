import { simulate } from "./simulate";
import type { DiscoveryRow } from "../types/discovery";
import type { RoleRegistry } from "../types/registry";
import { emptyRule, Rule, setConditions } from "../types/rule";

const registry: RoleRegistry = {
  maxConditionsPerRule: 4,
  roles: [
    {
      role: "business_unit",
      label: "BU",
      field: "primary_tags.bu",
      cardinality: "single",
      enabled: true,
    },
    {
      role: "stage",
      label: "Stage",
      field: "primary_tags.stage",
      cardinality: "single",
      enabled: true,
    },
    {
      role: "weird",
      label: "Weird",
      field: "primary_tags.other",
      cardinality: "single",
      enabled: true,
    },
  ],
  defaultSeverity: { mode: "leave" },
  routeMatcher: "true",
  pipelineCustomId: "p",
};

const row = (
  name: string,
  bu: string | null,
  stage: string | null,
  sev: string | null,
  c: number,
): DiscoveryRow => ({
  "event.name": name,
  bu,
  app: null,
  tier: null,
  stage,
  "event.severity": sev,
  c,
});

let n = 0;
const rule = (o: Partial<Rule>): Rule => ({
  ...emptyRule(),
  rule_id: `r${n++}`,
  name: `rule${n}`,
  ...o,
});

const rows = [
  row("CPU", "trading", "dev", "3", 10),
  row("CPU", "trading", "prod", "3", 5),
  row("CPU", "retail", null, "3", 2),
  row("Disk", "trading", "prod", "3", 7),
];

describe("simulate", () => {
  test("a Default sets severity for every row of that event; uncovered events are reported", () => {
    const r = simulate(
      rows,
      [rule({ event_name: "CPU", severity: "2" })],
      registry,
    );
    expect(r.matchedEvents).toBe(17);
    expect(r.changedEvents).toBe(17);
    expect(r.uncovered).toEqual([{ eventName: "Disk", count: 7 }]);
    expect(r.transitions).toContainEqual({ from: "3", to: "2", count: 17 });
  });

  test("D19/D20: an exception overrides the default in the downgrade direction; last exception wins", () => {
    const def = rule({ event_name: "CPU", severity: "1" });
    const first = setConditions(
      rule({ event_name: "CPU", severity: "4", order: 0 }),
      [{ role: "stage", value: "dev" }],
    );
    const second = setConditions(
      rule({ event_name: "CPU", severity: "5", order: 1 }),
      [{ role: "business_unit", value: "trading" }],
    );
    const r = simulate(rows, [def, first, second], registry);
    // trading/dev matches both exceptions -> order 1 wins (5); trading/prod -> 5; retail -> default 1.
    expect(r.transitions).toContainEqual({ from: "3", to: "5", count: 15 });
    expect(r.transitions).toContainEqual({ from: "3", to: "1", count: 2 });
  });

  test('"(not set)" matches a null role value', () => {
    const ex = setConditions(
      rule({ event_name: "CPU", severity: "4", order: 0 }),
      [{ role: "stage", value: "" }],
    );
    const r = simulate(rows, [ex], registry);
    expect(r.matchedEvents).toBe(2);
  });

  test("contains matching on the event name", () => {
    const r = simulate(
      rows,
      [
        rule({
          event_name: "isk",
          event_name_match: "contains",
          severity: "1",
        }),
      ],
      registry,
    );
    expect(r.matchedEvents).toBe(7);
  });

  test("detector, threshold and unprobed-role rules are skipped with a reason, not guessed", () => {
    const rules = [
      rule({ detector_id: "abc", severity: "1" }),
      rule({ event_name: "CPU", rule_type: "threshold" }),
      setConditions(rule({ event_name: "CPU", severity: "1", order: 0 }), [
        { role: "weird", value: "x" },
      ]),
    ];
    const r = simulate(rows, rules, registry);
    expect(r.skippedRules).toHaveLength(3);
    expect(r.matchedEvents).toBe(0);
  });

  test("disabled rules are ignored; defaultSeverity set applies to unmatched events", () => {
    const reg = {
      ...registry,
      defaultSeverity: { mode: "set" as const, value: "4" },
    };
    const r = simulate(
      rows,
      [rule({ event_name: "CPU", severity: "1", enabled: false })],
      reg,
    );
    expect(r.matchedEvents).toBe(0);
    expect(r.changedEvents).toBe(24);
  });
});
