import { emptyRule, Rule, setConditions } from "../types/rule";
import { filterTree, groupRules, summarizeTree } from "./group";

const rule = (id: string, o: Partial<Rule> = {}): Rule => ({
  ...emptyRule(),
  rule_id: id,
  name: id,
  updated_by: "t",
  ...o,
});
const exception = (id: string, order: number, o: Partial<Rule> = {}): Rule =>
  setConditions(rule(id, { severity: "1", order, ...o }), [
    { role: "business_unit", value: "bu1" },
  ]);

const label = (g: { kind: string; target: string }) => g.target;

describe("groupRules", () => {
  it("nests exceptions under the default that shares their target", () => {
    const tree = groupRules(
      [
        rule("d1", { event_name: "CPU", severity: "3" }),
        exception("e1", 0, { event_name: "CPU" }),
        exception("e2", 1, { event_name: "CPU" }),
        rule("d2", { event_name: "Disk", severity: "2" }),
      ],
      label,
    );
    expect(tree.groups.map((g) => g.target)).toEqual(["CPU", "Disk"]);
    expect(tree.groups[0].default?.rule_id).toBe("d1");
    expect(tree.groups[0].exceptions.map((r) => r.rule_id)).toEqual([
      "e1",
      "e2",
    ]);
    expect(tree.groups[1].exceptions).toEqual([]);
  });

  it("keeps exceptions in global order, which is their precedence", () => {
    const tree = groupRules(
      [
        exception("late", 5, { event_name: "CPU" }),
        exception("early", 1, { event_name: "CPU" }),
      ],
      label,
    );
    expect(tree.groups[0].exceptions.map((r) => r.rule_id)).toEqual([
      "early",
      "late",
    ]);
  });

  it("surfaces an exception whose target has no default as an orphan, not a hidden row", () => {
    const tree = groupRules(
      [exception("e1", 0, { event_name: "Lonely" })],
      label,
    );
    expect(tree.groups).toHaveLength(1);
    expect(tree.groups[0].default).toBeNull();
    expect(summarizeTree(tree)).toMatchObject({
      orphans: 1,
      withDefault: 0,
      exceptions: 1,
    });
  });

  it("puts label-only exceptions in their own list", () => {
    const tree = groupRules(
      [exception("any", 0), rule("d1", { event_name: "CPU", severity: "3" })],
      label,
    );
    expect(tree.anyEvent.map((r) => r.rule_id)).toEqual(["any"]);
    expect(tree.groups).toHaveLength(1);
  });

  it("keeps a detector and an event of the same text apart", () => {
    const tree = groupRules(
      [
        rule("a", { event_name: "x", severity: "1" }),
        rule("b", { detector_id: "x", event_name: null, severity: "2" }),
      ],
      label,
    );
    expect(tree.groups.map((g) => g.kind).sort()).toEqual([
      "detector",
      "event",
    ]);
  });

  it("orders groups by their display name, not their raw id", () => {
    const tree = groupRules(
      [
        rule("z", { detector_id: "zzz", event_name: null, severity: "1" }),
        rule("a", { detector_id: "aaa", event_name: null, severity: "1" }),
      ],
      (g) => (g.target === "zzz" ? "Alpha detector" : "Beta detector"),
    );
    expect(tree.groups.map((g) => g.target)).toEqual(["zzz", "aaa"]);
  });
});

describe("filterTree", () => {
  const tree = groupRules(
    [
      rule("d1", { event_name: "CPU Saturation", severity: "3" }),
      exception("e1", 0, {
        event_name: "CPU Saturation",
        name: "payments override",
      }),
      rule("d2", { event_name: "Disk full", severity: "2" }),
    ],
    label,
  );

  it("returns everything for an empty query", () => {
    expect(
      filterTree(
        tree,
        "  ",
        () => false,
        () => false,
      ),
    ).toBe(tree);
  });

  it("keeps a group when its target or any rule inside matches", () => {
    const byTarget = filterTree(
      tree,
      "disk",
      (g) => g.target.toLowerCase().includes("disk"),
      () => false,
    );
    expect(byTarget.groups.map((g) => g.target)).toEqual(["Disk full"]);

    const byRule = filterTree(
      tree,
      "payments",
      () => false,
      (r) => r.name.includes("payments"),
    );
    expect(byRule.groups.map((g) => g.target)).toEqual(["CPU Saturation"]);
  });
});
