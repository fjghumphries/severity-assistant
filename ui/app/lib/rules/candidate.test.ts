import { emptyRegistry, RoleRegistry } from "../types/registry";
import { emptyRule, isException, Rule, setConditions } from "../types/rule";
import {
  buildCandidate,
  FormValues,
  nextExceptionOrder,
  removeRule,
  swapOrder,
} from "./candidate";

const registry: RoleRegistry = {
  ...emptyRegistry(),
  roles: [
    {
      role: "business_unit",
      label: "Business Unit",
      field: "primary_tags.bu",
      cardinality: "single",
      enabled: true,
    },
  ],
};

const rule = (id: string, o: Partial<Rule> = {}): Rule => ({
  ...emptyRule(),
  rule_id: id,
  name: id,
  updated_by: "t",
  ...o,
});
const exception = (id: string, order: number, o: Partial<Rule> = {}): Rule =>
  setConditions(rule(id, { severity: "1", order, event_name: "CPU", ...o }), [
    { role: "business_unit", value: "bu1" },
  ]);

const values = (o: Partial<FormValues> = {}): FormValues => ({
  kind: "default",
  name: "",
  matchMode: "event",
  eventName: "CPU",
  detectorId: null,
  ruleType: "keyed",
  severity: "3",
  parsePattern: "",
  thresholdBounds: "",
  conditions: [],
  ...o,
});

const build = (v: FormValues, rules: Rule[] = [], base?: Rule) =>
  buildCandidate({
    values: v,
    base,
    rules,
    registry,
    deriveName: ({ values: x }) => x.name.trim() || x.eventName,
    now: new Date("2026-10-26T10:00:00Z"),
    userEmail: "me@example.com",
  });

describe("buildCandidate", () => {
  it("builds a default with no conditions and no place in the exception order", () => {
    const r = build(values());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isException(r.candidate)).toBe(false);
    expect(r.candidate.order).toBeNull();
    expect(r.candidate.event_name).toBe("CPU");
    expect(r.candidate.severity).toBe("3");
    expect(r.next).toHaveLength(1);
  });

  it("refuses a second default on the same target instead of saving a contradiction", () => {
    const r = build(values(), [
      rule("existing", { event_name: "CPU", severity: "2" }),
    ]);
    expect(r.ok).toBe(false);
  });

  it("lets an edit keep its own target without clashing with itself", () => {
    const existing = rule("existing", { event_name: "CPU", severity: "2" });
    const r = build(values({ severity: "1" }), [existing], existing);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.next.map((x) => x.severity)).toEqual(["1"]);
  });

  it("puts a new exception at the end of the order and keeps an edited one where it was", () => {
    const rules = [exception("a", 0), exception("b", 1)];
    const added = build(
      values({
        kind: "exception",
        conditions: [{ role: "business_unit", value: "bu9" }],
      }),
      rules,
    );
    expect(added.ok && added.candidate.order).toBe(2);

    const edited = build(
      values({
        kind: "exception",
        conditions: [{ role: "business_unit", value: "bu9" }],
      }),
      rules,
      rules[0],
    );
    expect(edited.ok && edited.candidate.order).toBe(0);
  });

  it("rejects an exception with no label condition", () => {
    const r = build(
      values({ kind: "exception", conditions: [{ role: null, value: "" }] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]).toMatch(/at least one label condition/);
  });

  it("stores a threshold rule with no fixed severity", () => {
    const r = build(
      values({
        ruleType: "threshold",
        parsePattern: "DATA 'x 'INT:sa_v",
        thresholdBounds: "50,20,10,5",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.candidate).toMatchObject({
        severity: null,
        threshold_bounds: "50,20,10,5",
      });
  });
});

describe("exception order", () => {
  const rules = [
    exception("a", 0),
    exception("b", 1),
    exception("c", 2),
    rule("d", { event_name: "X", severity: "3" }),
  ];

  it("nextExceptionOrder starts at 0 and ignores defaults", () => {
    expect(
      nextExceptionOrder([rule("d", { event_name: "X", severity: "3" })]),
    ).toBe(0);
    expect(nextExceptionOrder(rules)).toBe(3);
  });

  it("swapOrder exchanges two places and touches nothing else", () => {
    const next = swapOrder(rules, "a", "c");
    expect(next.map((r) => r.order)).toEqual([2, 1, 0, null]);
  });

  it("removing an exception renumbers the rest so the order stays dense", () => {
    // Leaving a gap would make validation reject the whole rule set (D20).
    const next = removeRule(rules, "b");
    expect(next.filter(isException).map((r) => [r.rule_id, r.order])).toEqual([
      ["a", 0],
      ["c", 1],
    ]);
  });

  it("removing a default does not disturb the exception order", () => {
    const next = removeRule(rules, "d");
    expect(next.filter(isException).map((r) => r.order)).toEqual([0, 1, 2]);
  });
});
