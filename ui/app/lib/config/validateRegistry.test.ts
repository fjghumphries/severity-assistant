import {
  derivedMaxConditions,
  emptyRegistry,
  RoleRegistry,
} from "../types/registry";
import { newProfile } from "./profiles";
import { validateRegistry } from "./validateRegistry";

const base = (): RoleRegistry => ({ ...emptyRegistry(), routeMatcher: "true" });
const messages = (r: RoleRegistry) => validateRegistry(r).map((i) => i.message);

describe("validateRegistry: matcher and profiles", () => {
  it("accepts a registry with no profiles, as before", () => {
    expect(validateRegistry(base())).toEqual([]);
  });

  it("rejects a matcher the platform would refuse, before any write", () => {
    expect(
      messages({ ...base(), routeMatcher: 'contains(event.name, "x")' }).join(
        " ",
      ),
    ).toMatch(/contains\(\) is not allowed/);
  });

  it("requires a new profile to get a matcher", () => {
    const r = base();
    r.profiles = [newProfile("Team A", r)];
    expect(messages(r).join(" ")).toMatch(
      /Profile "Team A": Route matcher cannot be empty/,
    );
    r.profiles = [
      {
        ...r.profiles[0],
        routeMatcher: 'matchesValue(primary_tags.bu, "bu1")',
      },
    ];
    expect(validateRegistry(r)).toEqual([]);
  });

  it("rejects duplicate names and pipeline ids across profiles, including the default", () => {
    const r = base();
    const a = { ...newProfile("Team A", r), routeMatcher: "true" };
    const b = {
      ...newProfile("team a", { ...r, profiles: [a] }),
      routeMatcher: "true",
    };
    r.profiles = [a, { ...b, pipelineCustomId: a.pipelineCustomId }];
    const m = messages(r).join(" | ");
    expect(m).toMatch(/another profile already has this name/);
    expect(m).toMatch(/pipeline custom ID .* already used/);
    r.profiles = [{ ...a, name: "Default" }];
    expect(messages(r).join(" ")).toMatch(/already has this name/);
  });

  it("validates each profile's own fallback and security context", () => {
    const r = base();
    r.profiles = [
      {
        ...newProfile("Team A", r),
        routeMatcher: "true",
        defaultSeverity: { mode: "set" },
        securityContext: { mode: "field", value: "not a path" },
      },
    ];
    const m = messages(r).join(" | ");
    expect(m).toMatch(/Profile "Team A": Mode "set" requires/);
    expect(m).toMatch(
      /Profile "Team A": "not a path" is not a plain field path/,
    );
  });
});

describe("max conditions", () => {
  it("rejects more than the four condition slots a rule can store", () => {
    const r = { ...emptyRegistry(), maxConditionsPerRule: 5 };
    expect(
      validateRegistry(r).some((i) => i.field === "maxConditionsPerRule"),
    ).toBe(true);
    expect(
      validateRegistry({ ...r, maxConditionsPerRule: 4 }).some(
        (i) => i.field === "maxConditionsPerRule",
      ),
    ).toBe(false);
  });

  it("is derived from the usable labels, between 1 and 4", () => {
    const role = (n: number, over = {}) => ({
      role: `r${n}`,
      label: `L${n}`,
      field: "f",
      cardinality: "single" as const,
      enabled: true,
      ...over,
    });
    expect(derivedMaxConditions([])).toBe(1);
    expect(derivedMaxConditions([role(1), role(2)])).toBe(2);
    expect(derivedMaxConditions([1, 2, 3, 4, 5, 6].map((n) => role(n)))).toBe(
      4,
    );
    expect(
      derivedMaxConditions([
        role(1),
        role(2, { enabled: false }),
        role(3, { cardinality: "multi" }),
      ]),
    ).toBe(1);
  });
});
