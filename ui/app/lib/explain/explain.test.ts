import { emptyRegistry, type RoleRegistry } from "../types/registry";
import { emptyRule, setConditions, type Rule } from "../types/rule";
import { explain } from "./explain";

const registry = (): RoleRegistry => ({
  ...emptyRegistry(),
  roles: [
    {
      role: "bu",
      label: "Business Unit",
      field: "a",
      cardinality: "single",
      enabled: true,
    },
    {
      role: "tier",
      label: "Tier",
      field: "b",
      cardinality: "single",
      enabled: true,
    },
  ],
});

const def = (id: string, event: string, sev: string): Rule => ({
  ...emptyRule(),
  rule_id: id,
  name: id,
  event_name: event,
  severity: sev,
});
const exc = (
  id: string,
  event: string | null,
  sev: string,
  order: number,
  conds: [string, string][],
): Rule =>
  setConditions(
    {
      ...emptyRule(),
      rule_id: id,
      name: id,
      event_name: event,
      severity: sev,
      order,
    },
    conds.map(([role, value]) => ({ role, value })),
  );

const input = (labels: Record<string, string>, eventName = "CPU") => ({
  eventName,
  detectorId: null,
  labels,
});

describe("explain", () => {
  it("uses the default when no exception matches", () => {
    const r = explain(
      [def("d", "CPU", "3"), exc("e", "CPU", "1", 1, [["bu", "pay"]])],
      registry(),
      input({ bu: "retail" }),
    );
    expect(r.severity).toBe("3");
    expect(r.source).toBe("default");
    expect(r.exceptions[0].matches).toBe(false);
    expect(r.exceptions[0].reason).toMatch(
      /Business Unit is retail, the rule needs pay/,
    );
  });

  it("lets the last matching exception win", () => {
    const rules = [
      def("d", "CPU", "3"),
      exc("first", "CPU", "2", 1, [["bu", "pay"]]),
      exc("second", "CPU", "1", 2, [
        ["bu", "pay"],
        ["tier", "gold"],
      ]),
    ];
    const r = explain(rules, registry(), input({ bu: "pay", tier: "gold" }));
    expect(r.winner?.rule_id).toBe("second");
    expect(r.severity).toBe("1");
    // swap the order and the other one wins
    const swapped = [
      rules[0],
      { ...rules[1], order: 2 },
      { ...rules[2], order: 1 },
    ];
    expect(
      explain(swapped, registry(), input({ bu: "pay", tier: "gold" })).winner
        ?.rule_id,
    ).toBe("first");
  });

  it("matches label values case-insensitively but event names exactly", () => {
    const rules = [
      def("d", "CPU", "3"),
      exc("e", "CPU", "1", 1, [["bu", "bu1"]]),
    ];
    expect(explain(rules, registry(), input({ bu: "BU1" })).source).toBe(
      "exception",
    );
    expect(explain(rules, registry(), input({ bu: "bu1" }, "cpu")).source).toBe(
      "no-rule",
    );
  });

  it("does not ignore a trailing space in a label value", () => {
    const rules = [exc("e", "CPU", "1", 1, [["bu", "bu1"]])];
    expect(explain(rules, registry(), input({ bu: "bu1 " })).source).toBe(
      "no-rule",
    );
  });

  it("treats a blank condition value as 'not set'", () => {
    const rules = [exc("e", "CPU", "1", 1, [["tier", ""]])];
    expect(explain(rules, registry(), input({})).source).toBe("exception");
    expect(explain(rules, registry(), input({ tier: "gold" })).source).toBe(
      "no-rule",
    );
  });

  it("applies the 'events with no rule' setting", () => {
    const reg = {
      ...registry(),
      defaultSeverity: { mode: "set" as const, value: "5" },
    };
    const r = explain([], reg, input({}));
    expect(r.severity).toBe("5");
    expect(explain([], registry(), input({})).severity).toBeNull();
  });

  it("ignores disabled rules", () => {
    const rules = [{ ...def("d", "CPU", "3"), enabled: false }];
    expect(explain(rules, registry(), input({})).source).toBe("no-rule");
  });

  it("reports threshold rules as undecided instead of guessing", () => {
    const t: Rule = {
      ...def("t", "CPU", "3"),
      rule_type: "threshold",
      severity: null,
      parse_pattern: "x",
      threshold_bounds: "50,20,10,5",
    };
    const r = explain([t], registry(), input({}));
    expect(r.undecided.map((x) => x.rule_id)).toEqual(["t"]);
    expect(r.source).toBe("no-rule");
  });

  it("matches a rule keyed on a detector", () => {
    const d: Rule = {
      ...emptyRule(),
      rule_id: "d",
      name: "d",
      detector_id: "abc",
      severity: "2",
    };
    expect(
      explain([d], registry(), {
        eventName: "x",
        detectorId: "abc",
        labels: {},
      }).severity,
    ).toBe("2");
    expect(
      explain([d], registry(), {
        eventName: "x",
        detectorId: "zzz",
        labels: {},
      }).source,
    ).toBe("no-rule");
  });

  it("lists only exceptions whose event or detector fits", () => {
    const rules = [
      exc("other", "Memory", "1", 1, [["bu", "pay"]]),
      exc("mine", "CPU", "2", 2, [["bu", "pay"]]),
    ];
    const r = explain(rules, registry(), input({ bu: "x" }));
    expect(r.exceptions.map((l) => l.rule.rule_id)).toEqual(["mine"]);
  });
});
