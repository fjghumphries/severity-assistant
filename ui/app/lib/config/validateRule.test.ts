import { validateRule } from "./validateRule";
import { RoleRegistry } from "../types/registry";
import { emptyRule, Rule, setConditions } from "../types/rule";

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
} as unknown as RoleRegistry;

function keyedDefault(over: Partial<Rule> = {}): Rule {
  return {
    ...emptyRule(),
    name: "r",
    event_name: "CPU saturation",
    severity: "3",
    ...over,
  };
}

describe("validateRule", () => {
  it("allows '|' in event names and condition values (no composite key any more)", () => {
    const def = keyedDefault({ event_name: "Disk | inode usage" });
    expect(validateRule(def, registry)).toEqual([]);
    const exc = setConditions({ ...def, order: 1 }, [
      { role: "business_unit", value: "retail|emea" },
    ]);
    expect(validateRule(exc, registry)).toEqual([]);
  });

  it("rejects 'contains' on a keyed default (the lookup is exact-only)", () => {
    const issues = validateRule(
      keyedDefault({ event_name_match: "contains" }),
      registry,
    );
    expect(issues.map((i) => i.field)).toContain("event_name_match");
  });

  it("still allows 'contains' on a keyed exception", () => {
    const exc = setConditions(
      keyedDefault({ event_name_match: "contains", order: 1 }),
      [{ role: "business_unit", value: "retail" }],
    );
    expect(validateRule(exc, registry)).toEqual([]);
  });
});
