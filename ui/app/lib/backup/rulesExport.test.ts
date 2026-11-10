import { emptyRegistry, type RoleRegistry } from "../types/registry";
import { emptyRule, setConditions, type Rule } from "../types/rule";
import {
  makeRulesExport,
  parseRulesExport,
  planImport,
  RULES_EXPORT_VERSION,
} from "./rulesExport";

const registry = (): RoleRegistry => ({
  ...emptyRegistry(),
  roles: [
    {
      role: "tier",
      label: "Tier",
      field: "primary_tags.tier",
      cardinality: "single",
      enabled: true,
    },
  ],
});

const def = (id: string, event: string): Rule => ({
  ...emptyRule(),
  rule_id: id,
  name: id,
  event_name: event,
  severity: "3",
});

const exc = (id: string, event: string, order: number): Rule =>
  setConditions(
    {
      ...emptyRule(),
      rule_id: id,
      name: id,
      event_name: event,
      severity: "1",
      order,
    },
    [{ role: "tier", value: "gold" }],
  );

const roundTrip = (rules: Record<string, Rule[]>, reg = registry()) =>
  parseRulesExport(JSON.stringify(makeRulesExport(reg, rules)));

describe("rules export", () => {
  it("round-trips rules exactly, keeping ids and the null/empty-string distinction", () => {
    const withEmpty = setConditions(exc("e1", "Foo", 1), [
      { role: "tier", value: "" },
    ]);
    const parsed = roundTrip({ default: [def("d1", "Foo"), withEmpty] });
    expect(parsed.issues).toEqual([]);
    expect(parsed.data.rules.default.map((r) => r.rule_id)).toEqual([
      "d1",
      "e1",
    ]);
    expect(parsed.data.rules.default[1].md1_value).toBe("");
    expect(parsed.data.rules.default[1].md2_value).toBeNull();
    expect(parsed.data.version).toBe(RULES_EXPORT_VERSION);
  });

  it("rejects text that is not JSON, not an export, or from a newer version", () => {
    expect(() => parseRulesExport("nope")).toThrow(/not valid JSON/);
    expect(() => parseRulesExport("{}")).toThrow(
      /not a Severity Assistant rules export/,
    );
    const future = { ...makeRulesExport(registry(), {}), version: 99 };
    expect(() => parseRulesExport(JSON.stringify(future))).toThrow(
      /Update the app/,
    );
  });

  it("reports invalid rules instead of throwing, so the preview can list them", () => {
    const bad = exc("e1", "Foo", 1);
    bad.md1_role = "gone";
    const parsed = roundTrip({ default: [bad] });
    expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it("flags rules for a team the export does not define", () => {
    const parsed = roundTrip({ ghost: [def("d1", "Foo")] });
    expect(parsed.issues.join(" ")).toMatch(/ghost/);
  });

  it("fills fields an older export lacks rather than leaving undefined", () => {
    const text = JSON.stringify({
      ...makeRulesExport(registry(), {}),
      rules: {
        default: [
          {
            rule_id: "x",
            name: "x",
            event_name: "Foo",
            severity: "2",
            enabled: true,
            rule_type: "keyed",
          },
        ],
      },
    });
    const r = parseRulesExport(text).data.rules.default[0];
    expect(r.md1_role).toBeNull();
    expect(r.detector_id).toBeNull();
  });
});

describe("planImport", () => {
  const current = {
    registry: registry(),
    rules: { default: [def("d1", "Foo")] } as Record<string, Rule[]>,
  };

  it("replace takes the file as is", () => {
    const incoming = makeRulesExport(registry(), {
      default: [def("d9", "Bar")],
    });
    const out = planImport(current, incoming, "replace");
    expect(out.rules.default.map((r) => r.rule_id)).toEqual(["d9"]);
  });

  it("merge keeps what exists and adds what is missing", () => {
    const incomingReg = registry();
    incomingReg.roles.push({
      role: "stage",
      label: "Stage",
      field: "s",
      cardinality: "single",
      enabled: true,
    });
    const incoming = makeRulesExport(incomingReg, {
      default: [def("d1", "Foo-changed"), def("d2", "Bar")],
    });
    const out = planImport(current, incoming, "merge");
    expect(out.rules.default.map((r) => r.rule_id)).toEqual(["d1", "d2"]);
    expect(out.rules.default[0].event_name).toBe("Foo"); // the existing rule wins
    expect(out.registry.roles.map((r) => r.role)).toEqual(["tier", "stage"]);
    expect(out.summary).toMatchObject({
      rulesAdded: 1,
      rulesSkipped: 1,
      labelsAdded: 1,
    });
  });

  it("merge adds a team and its rules", () => {
    const incomingReg = {
      ...registry(),
      profiles: [
        {
          id: "p2",
          name: "Payments",
          pipelineCustomId: "pipeline_p2",
          routeMatcher: 'matchesValue(a,"b")',
          defaultSeverity: { mode: "leave" as const },
        },
      ],
    };
    const out = planImport(
      current,
      makeRulesExport(incomingReg, { p2: [def("p2d", "Foo")] }),
      "merge",
    );
    expect(out.registry.profiles?.map((p) => p.id)).toEqual(["p2"]);
    expect(out.rules.p2).toHaveLength(1);
    expect(out.rules.default).toHaveLength(1);
  });

  it("does not mutate its inputs", () => {
    const snap = JSON.stringify(current);
    planImport(
      current,
      makeRulesExport(registry(), { default: [def("d2", "Bar")] }),
      "merge",
    );
    expect(JSON.stringify(current)).toBe(snap);
  });
});
