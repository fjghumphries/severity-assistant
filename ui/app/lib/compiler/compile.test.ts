/**
 * Snapshot/unit tests for the pure compiler. See docs/04-pipeline-compiler-spec.md's "Testing
 * the compiler without a tenant" for the enumerated scenarios this file implements. No tenant,
 * no SDK, no I/O -- `compile` is a pure function and these are pure Jest tests.
 */

import { compile } from "./compile";
import { RoleRegistry } from "../types/registry";
import { emptyRule, Rule, setConditions } from "../types/rule";

function makeRegistry(overrides: Partial<RoleRegistry> = {}): RoleRegistry {
  return {
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
        role: "stage",
        label: "Stage",
        field: "primary_tags.stage",
        cardinality: "single",
        enabled: true,
      },
    ],
    defaultSeverity: { mode: "leave" },
    routeMatcher: "true",
    pipelineCustomId: "pipeline_severity_assistant_v1",
    ...overrides,
  };
}

let idCounter = 0;
function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    ...emptyRule(),
    rule_id: `r_test_${idCounter++}`,
    name: "Test rule",
    updated_by: "test@example.com",
    ...overrides,
  };
}

function exceptionProcessors(pipeline: ReturnType<typeof compile>) {
  if (!pipeline.ok) throw new Error("expected a successful compile");
  return pipeline.pipeline.processing.processors.filter((p) =>
    p.id.startsWith("sevassist_exception_"),
  );
}

describe("compile", () => {
  test("empty rule set compiles to an inert pipeline with only the combiner", () => {
    const result = compile([], makeRegistry());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pipeline.processing.processors).toHaveLength(1);
    expect(result.pipeline.processing.processors[0].id).toBe(
      "sevassist_apply_severity",
    );
  });

  test("one keyed default compiles to just a lookup + the final combiner", () => {
    const rule = makeRule({
      rule_id: "r_default_1",
      name: "CPU Saturation default",
      event_name: "CPU Saturation",
      severity: "3",
    });
    const result = compile([rule], makeRegistry());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.pipeline.processing.processors.map((p) => p.id);
    expect(ids).toEqual([
      "sevassist_default_by_event_name",
      "sevassist_apply_severity",
    ]);
  });

  test("D19: two enabled defaults with the same target are rejected, not silently ambiguous", () => {
    const a = makeRule({
      rule_id: "r_a",
      name: "A",
      event_name: "Foo",
      severity: "2",
    });
    const b = makeRule({
      rule_id: "r_b",
      name: "B",
      event_name: "Foo",
      severity: "4",
    });
    const result = compile([a, b], makeRegistry());
    expect(result.ok).toBe(false);
  });

  test("a rule referencing a role missing from the registry is rejected", () => {
    const rule = setConditions(
      makeRule({ rule_id: "r_c", name: "C", event_name: "Foo", order: 0 }),
      [{ role: "nonexistent", value: "x" }],
    );
    const result = compile([rule], makeRegistry());
    expect(result.ok).toBe(false);
  });

  test("D10: a rule referencing a multi-cardinality role is rejected", () => {
    const registry = makeRegistry({
      roles: [
        {
          role: "multi_role",
          label: "Multi",
          field: "dt.security_context",
          cardinality: "multi",
          enabled: true,
        },
      ],
    });
    const rule = setConditions(
      makeRule({ rule_id: "r_d", name: "D", event_name: "Foo", order: 0 }),
      [{ role: "multi_role", value: "x" }],
    );
    const result = compile([rule], registry);
    expect(result.ok).toBe(false);
  });

  test("D9: remapping a role's field changes only the compiled matcher, not the rule record", () => {
    const rule = setConditions(
      makeRule({
        rule_id: "r_e",
        name: "E",
        event_name: "Foo",
        severity: "1",
        order: 0,
      }),
      [{ role: "business_unit", value: "BU1" }],
    );
    const frozen = JSON.parse(JSON.stringify(rule));

    const registryA = makeRegistry();
    const registryB = makeRegistry({
      roles: registryA.roles.map((r) =>
        r.role === "business_unit" ? { ...r, field: "tags.other_bu" } : r,
      ),
    });

    const resultA = compile([rule], registryA);
    const resultB = compile([rule], registryB);
    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);
    expect(rule).toEqual(frozen); // compile must never mutate its input

    if (!resultA.ok || !resultB.ok) return;
    const matcherA = exceptionProcessors(resultA)[0].matcher;
    const matcherB = exceptionProcessors(resultB)[0].matcher;
    expect(matcherA).toContain("primary_tags.bu");
    expect(matcherB).toContain("tags.other_bu");
    expect(matcherA).not.toEqual(matcherB);
  });

  test("D20: the higher-order exception wins regardless of role-condition count", () => {
    const registry = makeRegistry();
    const broad = setConditions(
      makeRule({
        rule_id: "r_broad",
        name: "Broad",
        event_name: "CPU Saturation",
        severity: "1",
        order: 0,
      }),
      [
        { role: "business_unit", value: "BU1" },
        { role: "stage", value: "prod" },
      ],
    );
    const narrowLater = setConditions(
      makeRule({
        rule_id: "r_narrow",
        name: "NarrowLater",
        event_name: "CPU Saturation",
        severity: "4",
        order: 1,
      }),
      [{ role: "business_unit", value: "BU1" }],
    );

    const result = compile([broad, narrowLater], registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ids = exceptionProcessors(result).map((p) => p.id);
    expect(ids[0]).toContain("r_broad");
    expect(ids[1]).toContain("r_narrow");

    const lastScript = exceptionProcessors(result).find((p) =>
      p.id.includes("r_narrow"),
    )?.dql?.script;
    expect(lastScript).toContain('"4"');
  });

  test("D20: reordering two exceptions changes which one is emitted last", () => {
    const registry = makeRegistry();
    const a = setConditions(
      makeRule({
        rule_id: "r_a2",
        name: "A2",
        event_name: "Foo",
        severity: "1",
        order: 0,
      }),
      [{ role: "business_unit", value: "BU1" }],
    );
    const b = setConditions(
      makeRule({
        rule_id: "r_b2",
        name: "B2",
        event_name: "Foo",
        severity: "2",
        order: 1,
      }),
      [{ role: "stage", value: "prod" }],
    );

    const result1 = compile([a, b], registry);
    const result2 = compile(
      [
        { ...a, order: 1 },
        { ...b, order: 0 },
      ],
      registry,
    );
    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    const last1 = exceptionProcessors(result1).slice(-1)[0].id;
    const last2 = exceptionProcessors(result2).slice(-1)[0].id;
    expect(last1).toContain("r_b2");
    expect(last2).toContain("r_a2");
  });

  test("D19: an exception overrides a default in the escalate direction", () => {
    const registry = makeRegistry();
    const defLow = makeRule({
      rule_id: "r_def2",
      name: "Default sev4",
      event_name: "Bar",
      severity: "4",
    });
    const escalate = setConditions(
      makeRule({
        rule_id: "r_exc_up",
        name: "Escalate in prod",
        event_name: "Bar",
        severity: "1",
        order: 0,
      }),
      [{ role: "stage", value: "prod" }],
    );
    const result = compile([defLow, escalate], registry);
    expect(result.ok).toBe(true);
  });

  test("D19: an exception overrides a default in the downgrade direction, and the combiner does no severity comparison", () => {
    const registry = makeRegistry();
    const def = makeRule({
      rule_id: "r_def",
      name: "Default sev1",
      event_name: "Foo",
      severity: "1",
    });
    const downgrade = setConditions(
      makeRule({
        rule_id: "r_exc_down",
        name: "Downgrade in dev",
        event_name: "Foo",
        severity: "4",
        order: 0,
      }),
      [{ role: "stage", value: "dev" }],
    );

    const result = compile([def, downgrade], registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const finalCombiner = result.pipeline.processing.processors.find(
      (p) => p.id === "sevassist_apply_severity",
    );
    expect(finalCombiner?.dql?.script).toContain(
      "coalesce(dt.temp.sev_exception, dt.temp.sev_default)",
    );
    // D7 (global conflict-policy setting) is retired -- no severity-magnitude comparison
    // should exist anywhere in the combiner.
    expect(finalCombiner?.dql?.script).not.toMatch(
      />=|<=|(?<!=)>(?!=)|(?<!=)<(?!=)/,
    );
  });

  test("the lookup reads the target field directly, with no key-building step", () => {
    const rule = makeRule({
      rule_id: "r_f",
      name: "F",
      event_name: "Foo",
      severity: "2",
    });
    const result = compile([rule], makeRegistry());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const procs = result.pipeline.processing.processors;
    // event.name and dt.settings.object_id are scalars, so no arrayFirst normalisation and no
    // composite key are needed (verified against the tenant: an inline lookup reads them directly).
    expect(
      procs.find((p) => p.id === "sevassist_default_by_event_name")
        ?.inlineLookup,
    ).toMatchObject({
      sourceField: "event.name",
      destinationField: "dt.temp.sev_default",
    });
    expect(procs.some((p) => p.id.startsWith("sevassist_build_keys"))).toBe(
      false,
    );
    expect(JSON.stringify(procs)).not.toContain("arrayFirst");
  });

  test("threshold default compiles to a guarded >= chain with fieldsRemove", () => {
    const rule = makeRule({
      rule_id: "r_thresh",
      name: "Error rate",
      rule_type: "threshold",
      event_name: "Failure rate increase",
      severity: null,
      parse_pattern: "DATA 'increase of error rate to 'INT:sa_v",
      threshold_bounds: "50,20,10,5",
    });
    const result = compile([rule], makeRegistry());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const proc = result.pipeline.processing.processors.find(
      (p) => p.id === `sevassist_threshold_${rule.rule_id}`,
    );
    expect(proc?.dql?.script).toBe(
      [
        "parse event.description, \"DATA 'increase of error rate to 'INT:sa_v\"",
        'fieldsAdd dt.temp.sev_default = if(isNull(sa_v), dt.temp.sev_default, else: if(sa_v >= 50, "1", else: if(sa_v >= 20, "2", else: if(sa_v >= 10, "3", else: if(sa_v >= 5, "4", else: "5")))))',
        "fieldsRemove sa_v",
      ].join("\n| "),
    );
  });

  test("threshold exception writes to the shared exception field", () => {
    const rule = setConditions(
      makeRule({
        rule_id: "r_thresh_exc",
        name: "Error rate override",
        rule_type: "threshold",
        event_name: "Failure rate increase",
        severity: null,
        parse_pattern: "DATA 'increase of error rate to 'INT:sa_v",
        threshold_bounds: "50,20,10,5",
        order: 0,
      }),
      [{ role: "stage", value: "dev" }],
    );
    const result = compile([rule], makeRegistry());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const proc = exceptionProcessors(result)[0];
    expect(proc.dql?.script).toContain("dt.temp.sev_exception");
    expect(proc.dql?.script).toContain("fieldsRemove sa_v");
  });

  test("a threshold rule whose parse_pattern doesn't capture into sa_v is rejected", () => {
    const rule = makeRule({
      rule_id: "r_bad_capture",
      name: "Bad capture",
      rule_type: "threshold",
      event_name: "Foo",
      severity: null,
      parse_pattern: "DATA 'x 'INT:v",
      threshold_bounds: "50,20,10,5",
    });
    const result = compile([rule], makeRegistry());
    expect(result.ok).toBe(false);
  });

  test("exception-processor budget overflow is rejected, not silently truncated", () => {
    const registry = makeRegistry();
    const rules: Rule[] = [];
    for (let i = 0; i < 1001; i++) {
      rules.push(
        setConditions(
          makeRule({
            rule_id: `r_bulk_${i}`,
            name: `Bulk ${i}`,
            event_name: null,
            severity: "3",
            order: i,
          }),
          [{ role: "business_unit", value: `bu-${i}` }],
        ),
      );
    }
    const result = compile(rules, registry);
    expect(result.ok).toBe(false);
  });

  test("compile is deterministic", () => {
    const rule = setConditions(
      makeRule({
        rule_id: "r_g",
        name: "G",
        event_name: "Foo",
        severity: "2",
        order: 0,
      }),
      [{ role: "business_unit", value: "BU1" }],
    );
    const registry = makeRegistry();
    const r1 = compile([rule], registry);
    const r2 = compile([rule], registry);
    expect(r1).toEqual(r2);
  });

  test("shuffling the rule array does not change the compiled output when `order` values are unchanged", () => {
    const registry = makeRegistry();
    const a = setConditions(
      makeRule({
        rule_id: "r_h1",
        name: "H1",
        event_name: "Foo",
        severity: "1",
        order: 0,
      }),
      [{ role: "business_unit", value: "BU1" }],
    );
    const b = setConditions(
      makeRule({
        rule_id: "r_h2",
        name: "H2",
        event_name: "Foo",
        severity: "2",
        order: 1,
      }),
      [{ role: "stage", value: "prod" }],
    );
    const c = makeRule({
      rule_id: "r_h3",
      name: "H3 default",
      event_name: "Bar",
      severity: "5",
    });

    const resultInOrder = compile([a, b, c], registry);
    const resultShuffled = compile([c, b, a], registry);
    expect(resultInOrder).toEqual(resultShuffled);
  });

  test("an 'any event' exception (no target) compiles and matches independent of event name", () => {
    const rule = setConditions(
      makeRule({
        rule_id: "r_any",
        name: "Any event BU1",
        event_name: null,
        severity: "2",
        order: 0,
      }),
      [{ role: "business_unit", value: "BU1" }],
    );
    const result = compile([rule], makeRegistry());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const proc = exceptionProcessors(result)[0];
    expect(proc.matcher).not.toContain("event.name");
    expect(proc.matcher).toContain("primary_tags.bu");
  });

  test("D20: order decides between two single-role exceptions, not registry role precedence", () => {
    // business_unit has precedence 1 (higher priority), stage has precedence 2 -- under the
    // old D13 model business_unit would win regardless of order; D20 replaces that entirely.
    const registry = makeRegistry();
    const buException = setConditions(
      makeRule({
        rule_id: "r_bu",
        name: "BU exception",
        event_name: "Foo",
        severity: "1",
        order: 0,
      }),
      [{ role: "business_unit", value: "BU1" }],
    );
    const stageException = setConditions(
      makeRule({
        rule_id: "r_stage",
        name: "Stage exception",
        event_name: "Foo",
        severity: "5",
        order: 1,
      }),
      [{ role: "stage", value: "prod" }],
    );
    const result = compile([buException, stageException], registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = exceptionProcessors(result).map((p) => p.id);
    expect(ids[ids.length - 1]).toContain("r_stage");
  });

  test('"(not set)" condition also matches an absent (null) tag, not just an empty string', () => {
    // Regression: an absent tag normalises to null and `null == ""` is not true, so a bare
    // equality matcher silently never matched "(not set)" exceptions.
    const exception = setConditions(
      makeRule({
        rule_id: "r_notset",
        name: "No stage",
        event_name: "Foo",
        severity: "4",
        order: 0,
      }),
      [{ role: "stage", value: "" }],
    );
    const result = compile([exception], makeRegistry());
    expect(result.ok).toBe(true);
    const matcher = exceptionProcessors(result)[0].matcher;
    expect(matcher).toContain("isNull(primary_tags.stage)");
    expect(matcher).not.toContain("arrayFirst");
    expect(matcher).toContain('==""');
    expect(matcher).not.toMatch(/^[^(]*==""\)?$/);
  });
});

describe("compile: security context stage", () => {
  const rule = () =>
    makeRule({
      rule_id: "r_sc",
      name: "Foo",
      event_name: "Foo",
      severity: "2",
    });

  test("not emitted unless the registry asks for it", () => {
    for (const securityContext of [undefined, { mode: "none" as const }]) {
      const result = compile([rule()], makeRegistry({ securityContext }));
      expect(result.ok && result.pipeline.securityContext).toBeFalsy();
    }
  });

  test("field mode copies from the named field", () => {
    const result = compile(
      [rule()],
      makeRegistry({
        securityContext: { mode: "field", value: "primary_tags.bu" },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [p] = result.pipeline.securityContext?.processors ?? [];
    expect(p.id).toBe("sevassist_security_context");
    expect(p.type).toBe("securityContext");
    expect(p.securityContext).toEqual({
      value: { type: "field", field: { sourceFieldName: "primary_tags.bu" } },
    });
  });

  test("constant mode writes the literal", () => {
    const result = compile(
      [rule()],
      makeRegistry({ securityContext: { mode: "constant", value: "teamA" } }),
    );
    expect(
      result.ok &&
        result.pipeline.securityContext?.processors[0].securityContext,
    ).toEqual({
      value: { type: "constant", constant: "teamA" },
    });
  });
});

describe("compile: default grouping", () => {
  test("event-name and detector defaults get one lookup each, keyed on the raw target value", () => {
    const byEvent = makeRule({
      rule_id: "r_k1",
      name: "E",
      event_name: "Foo",
      severity: "2",
    });
    const byDetector = makeRule({
      rule_id: "r_k2",
      name: "D",
      event_name: null,
      detector_id: "obj1",
      severity: "3",
    });
    const result = compile([byEvent, byDetector], makeRegistry());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const procs = result.pipeline.processing.processors;
    expect(procs.map((p) => p.id)).toEqual([
      "sevassist_default_by_detector",
      "sevassist_default_by_event_name",
      "sevassist_apply_severity",
    ]);
    expect(
      procs.find((p) => p.id === "sevassist_default_by_detector")?.inlineLookup
        ?.sourceField,
    ).toBe("dt.settings.object_id");
    expect(
      procs.find((p) => p.id === "sevassist_default_by_event_name")
        ?.inlineLookup?.inlineLookupTable,
    ).toBe(JSON.stringify([[["Foo"], "2"]]));
    expect(result.stats.defaultGroupCount).toBe(2);
  });

  test("the merge processor is emitted only when keyed and threshold defaults coexist", () => {
    const keyed = makeRule({
      rule_id: "r_m1",
      name: "K",
      event_name: "Foo",
      severity: "2",
    });
    const threshold = makeRule({
      rule_id: "r_m2",
      name: "T",
      rule_type: "threshold",
      event_name: "Bar",
      severity: null,
      parse_pattern: "DATA 'x 'INT:sa_v",
      threshold_bounds: "50,20,10,5",
    });
    const both = compile([keyed, threshold], makeRegistry());
    expect(
      both.ok && both.pipeline.processing.processors.map((p) => p.id),
    ).toContain("sevassist_default_combine");
    const keyedOnly = compile([keyed], makeRegistry());
    expect(
      keyedOnly.ok && keyedOnly.pipeline.processing.processors.map((p) => p.id),
    ).not.toContain("sevassist_default_combine");
  });
});
