import { emptyRegistry, type RoleRegistry } from "../types/registry";
import { emptyRule, setConditions, type Rule } from "../types/rule";
import { labelImpact } from "./labelImpact";

const registry = (): RoleRegistry => ({
  ...emptyRegistry(),
  roles: [
    {
      role: "tier",
      label: "Tier",
      field: "t",
      cardinality: "single",
      enabled: true,
    },
    {
      role: "stage",
      label: "Stage",
      field: "s",
      cardinality: "single",
      enabled: true,
    },
  ],
});

const ruleWith = (name: string, roles: string[]): Rule =>
  setConditions(
    { ...emptyRule(), rule_id: name, name, order: 1 },
    roles.map((role) => ({ role, value: "x" })),
  );

const one = (rules: Rule[]) => [
  { profileId: "default", profileName: "Default", rules },
];

describe("labelImpact", () => {
  it("reports nothing when nothing changed", () => {
    const r = registry();
    expect(labelImpact(r, r, one([ruleWith("a", ["tier"])]))).toEqual([]);
  });

  it("flags a rule that uses a removed label", () => {
    const saved = registry();
    const draft = {
      ...saved,
      roles: saved.roles.filter((r) => r.role !== "tier"),
    };
    const out = labelImpact(
      saved,
      draft,
      one([ruleWith("a", ["tier"]), ruleWith("b", ["stage"])]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].ruleName).toBe("a");
    expect(out[0].reason).toContain("removed");
  });

  it("says disabled, not removed, when the label is only switched off", () => {
    const saved = registry();
    const draft = {
      ...saved,
      roles: saved.roles.map((r) =>
        r.role === "tier" ? { ...r, enabled: false } : r,
      ),
    };
    const out = labelImpact(saved, draft, one([ruleWith("a", ["tier"])]));
    expect(out[0].reason).toContain("disabled");
  });

  it("flags rules with more conditions than a lowered limit", () => {
    const saved = { ...registry(), maxConditionsPerRule: 4 };
    const draft = { ...saved, maxConditionsPerRule: 1 };
    const out = labelImpact(
      saved,
      draft,
      one([ruleWith("a", ["tier", "stage"]), ruleWith("b", ["tier"])]),
    );
    expect(out.map((o) => o.ruleName)).toEqual(["a"]);
  });

  it("reports across every profile", () => {
    const saved = registry();
    const draft = {
      ...saved,
      roles: saved.roles.filter((r) => r.role !== "stage"),
    };
    const out = labelImpact(saved, draft, [
      {
        profileId: "default",
        profileName: "Default",
        rules: [ruleWith("a", ["stage"])],
      },
      {
        profileId: "p2",
        profileName: "Payments",
        rules: [ruleWith("b", ["stage"])],
      },
    ]);
    expect(out.map((o) => o.profileName)).toEqual(["Default", "Payments"]);
  });

  it("ignores a rule that was already invalid before the change", () => {
    const saved = registry();
    const out = labelImpact(saved, saved, one([ruleWith("a", ["gone"])]));
    expect(out).toEqual([]);
  });
});
