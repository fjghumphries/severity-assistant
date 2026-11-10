import type { DiscoveryRow } from "../types/discovery";
import { emptyRegistry, type RoleRegistry } from "../types/registry";
import { emptyRule, setConditions } from "../types/rule";
import { columnFor, labelValueOptions } from "./values";

const registry = (): RoleRegistry => ({
  ...emptyRegistry(),
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
    {
      role: "custom_1",
      label: "Team",
      field: "my.custom.field",
      cardinality: "single",
      enabled: true,
    },
  ],
});

const row = (
  name: string,
  bu: string | null,
  tier: string | null,
  c: number,
): DiscoveryRow => ({
  "event.name": name,
  bu,
  app: null,
  tier,
  stage: null,
  "event.severity": null,
  c,
});

const rows = [
  row("CPU", "pay", "gold", 5),
  row("CPU", "pay", "bronze", 2),
  row("CPU", "retail", null, 1),
  row("Mem", "hr", "gold", 9),
];

describe("labelValueOptions", () => {
  it("offers the values seen for the chosen event, most frequent first", () => {
    const out = labelValueOptions(
      rows,
      [],
      registry(),
      ["business_unit", "tier"],
      "CPU",
    );
    expect(out.business_unit.map((o) => o.value)).toEqual(["pay", "retail"]);
    expect(out.business_unit[0].count).toBe(7);
    expect(out.tier.map((o) => o.value)).toEqual(["gold", "bronze"]);
  });

  it("uses every event when none is chosen, and ignores blanks", () => {
    const out = labelValueOptions(
      rows,
      [],
      registry(),
      ["business_unit"],
      null,
    );
    expect(out.business_unit.map((o) => o.value)).toEqual([
      "hr",
      "pay",
      "retail",
    ]);
  });

  it("falls back to every event when the chosen one was not seen", () => {
    const out = labelValueOptions(
      rows,
      [],
      registry(),
      ["business_unit"],
      "Rare",
    );
    expect(out.business_unit.length).toBe(3);
  });

  it("adds values existing rules use, even when no recent event carries them", () => {
    const rule = setConditions(
      {
        ...emptyRule(),
        rule_id: "r",
        name: "r",
        event_name: "CPU",
        severity: "1",
        order: 1,
      },
      [{ role: "business_unit", value: "legal" }],
    );
    const out = labelValueOptions(
      rows,
      [rule],
      registry(),
      ["business_unit"],
      "CPU",
    );
    expect(out.business_unit.find((o) => o.value === "legal")).toEqual({
      value: "legal",
      count: 0,
    });
  });

  it("gives rule values for a label the live data does not carry", () => {
    const rule = setConditions(
      { ...emptyRule(), rule_id: "r", name: "r", severity: "1", order: 1 },
      [{ role: "custom_1", value: "alpha" }],
    );
    const out = labelValueOptions(rows, [rule], registry(), ["custom_1"], null);
    expect(out.custom_1).toEqual([{ value: "alpha", count: 0 }]);
    expect(columnFor(registry(), "custom_1")).toBeUndefined();
  });
});
