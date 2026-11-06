import { emptyRegistry, RoleRegistry } from "../types/registry";
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
