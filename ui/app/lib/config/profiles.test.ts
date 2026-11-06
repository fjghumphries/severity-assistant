import { emptyRegistry, RoleRegistry } from "../types/registry";
import {
  DEFAULT_PROFILE_ID,
  DEFAULT_RULES_KEY,
  effectiveRegistry,
  listProfiles,
  newProfile,
  removedProfileIds,
  resolveProfileId,
  rulesKeyFor,
  slugify,
} from "./profiles";

const reg = (): RoleRegistry => ({ ...emptyRegistry(), routeMatcher: "true" });

describe("profiles", () => {
  it("keeps the original rules key for the default profile", () => {
    expect(rulesKeyFor(DEFAULT_PROFILE_ID)).toBe(DEFAULT_RULES_KEY);
    expect(rulesKeyFor("team-a")).toBe("severity-assistant.rules.team-a.v1");
  });

  it("a registry without profiles has exactly the default one, and is returned unchanged", () => {
    const r = reg();
    expect(listProfiles(r).map((p) => p.id)).toEqual(["default"]);
    expect(effectiveRegistry(r, "default")).toBe(r);
    expect(effectiveRegistry(r, "missing")).toBe(r);
  });

  it("creates a profile that cannot take events until a matcher is entered", () => {
    const r = reg();
    const p = newProfile("Team Alpha / EU", r);
    expect(p).toMatchObject({
      id: "team-alpha-eu",
      routeMatcher: "",
      pipelineCustomId: "pipeline_severity_assistant_team_alpha_eu",
    });
    r.profiles = [p, newProfile("Team Alpha / EU", { ...r, profiles: [p] })];
    expect(r.profiles.map((x) => x.id)).toEqual([
      "team-alpha-eu",
      "team-alpha-eu-2",
    ]);
  });

  it("builds the per-profile view with managed names, sharing roles", () => {
    const r = reg();
    const p = {
      ...newProfile("Team A", r),
      routeMatcher: 'matchesValue(primary_tags.bu, "bu1")',
    };
    r.profiles = [p];
    const eff = effectiveRegistry(r, p.id);
    expect(eff.pipelineCustomId).toBe(p.pipelineCustomId);
    expect(eff.routeMatcher).toBe(p.routeMatcher);
    expect(eff.roles).toBe(r.roles);
    expect(eff.pipelineDisplayName).toBe(
      "Severity Assistant: Team A (generated -- do not edit)",
    );
    expect(eff.routeDescription).toBe(
      "Severity Assistant: Team A (managed by the app)",
    );
    expect(resolveProfileId(r, "team-a")).toBe("team-a");
    expect(resolveProfileId(r, "gone")).toBe("default");
    expect(slugify("  --A_b  ")).toBe("a-b");
  });
});

describe("removedProfileIds", () => {
  it("lists stored profiles that are no longer in the draft, never the default", () => {
    const r = reg();
    const a = newProfile("A", r);
    const b = newProfile("B", { ...r, profiles: [a] });
    expect(removedProfileIds([a, b], [a])).toEqual([b.id]);
    expect(removedProfileIds([a], [a])).toEqual([]);
    expect(removedProfileIds([], [a])).toEqual([]);
  });
});
