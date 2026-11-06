import { RoleRegistry } from "../types/registry";
import { emptyRule, Rule, setConditions } from "../types/rule";
import { buildDeployPlan } from "../deploy/plan";
import { compile } from "./compile";

/** Remapping a label to a different tenant field must change the compiled matchers of every rule
 * that uses it, and must be invisible to rules that do not. If this ever fails silently the app
 * "looks fine" while matching on the wrong field (docs/11: almost every failure here is silent). */

const registryWith = (tierField: string, stageField: string): RoleRegistry =>
  ({
    maxConditionsPerRule: 4,
    pipelineCustomId: "pipeline_x",
    pipelineDisplayName: "x",
    routeMatcher: "true",
    defaultSeverity: { mode: "leave" },
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
        field: tierField,
        cardinality: "single",
        enabled: true,
      },
      {
        role: "stage",
        label: "Stage",
        field: stageField,
        cardinality: "single",
        enabled: true,
      },
    ],
  }) as unknown as RoleRegistry;

const base = { ...emptyRule(), updated_by: "t" };
const rules: Rule[] = [
  { ...base, rule_id: "d", name: "d", event_name: "Foo", severity: "3" },
  setConditions(
    {
      ...base,
      rule_id: "e",
      name: "e",
      event_name: "Foo",
      severity: "1",
      order: 0,
    },
    [
      { role: "business_unit", value: "bu1" },
      { role: "tier", value: "bronze" },
    ],
  ),
];

const matcherOf = (reg: RoleRegistry): string => {
  const c = compile(rules, reg);
  if (!c.ok) throw new Error("compile failed");
  return c.pipeline.processing.processors.find((p) =>
    p.id.startsWith("sevassist_exception_"),
  )!.matcher;
};

it("remapping a role a rule uses changes the compiled matcher", () => {
  expect(
    matcherOf(registryWith("primary_tags.tier", "primary_tags.stage")),
  ).toContain("primary_tags.tier");
  expect(
    matcherOf(registryWith("primary_tags.stage2", "primary_tags.stage")),
  ).toContain("primary_tags.stage2");
});

it("remapping a role no rule uses changes nothing, so there is nothing to deploy", () => {
  const before = compile(
    rules,
    registryWith("primary_tags.tier", "primary_tags.stage"),
  );
  const after = compile(
    rules,
    registryWith("primary_tags.tier", "primary_tags.stage2"),
  );
  if (!before.ok || !after.ok) throw new Error("compile failed");
  const live = {
    objectId: "o",
    updateToken: "t",
    value: before.pipeline as never,
  };
  expect(buildDeployPlan(after.pipeline, live).noChange).toBe(true);
});

it("remapping a role a rule uses is a deployable change", () => {
  const before = compile(
    rules,
    registryWith("primary_tags.tier", "primary_tags.stage"),
  );
  const after = compile(
    rules,
    registryWith("primary_tags.stage2", "primary_tags.stage"),
  );
  if (!before.ok || !after.ok) throw new Error("compile failed");
  const live = {
    objectId: "o",
    updateToken: "t",
    value: before.pipeline as never,
  };
  expect(buildDeployPlan(after.pipeline, live).noChange).toBe(false);
});
