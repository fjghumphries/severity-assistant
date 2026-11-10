import { emptyRegistry } from "../types/registry";
import { matcherProblems } from "../compiler/syntax";
import { validateRegistry } from "./validateRegistry";
import {
  isAllEvents,
  matcherPresetOf,
  SAFE_DEFAULT_MATCHER,
} from "./matcherPresets";

describe("matcher presets", () => {
  it("recognises 'all events' only as the literal true", () => {
    expect(isAllEvents("true")).toBe(true);
    expect(isAllEvents("  true ")).toBe(true);
    expect(isAllEvents(SAFE_DEFAULT_MATCHER)).toBe(false);
    expect(isAllEvents('matchesValue(a, "true")')).toBe(false);
    expect(matcherPresetOf("true")).toBe("all");
    expect(matcherPresetOf(SAFE_DEFAULT_MATCHER)).toBe("custom");
  });

  it("the safe default passes the app's matcher allowlist", () => {
    expect(matcherProblems(SAFE_DEFAULT_MATCHER)).toEqual([]);
  });

  it("a fresh registry no longer takes every event", () => {
    const r = emptyRegistry();
    expect(isAllEvents(r.routeMatcher)).toBe(false);
    expect(r.routeMatcher).toBe(SAFE_DEFAULT_MATCHER);
  });

  it("a fresh registry with labels validates", () => {
    const r = emptyRegistry();
    r.roles = [
      {
        role: "tier",
        label: "Tier",
        field: "primary_tags.tier",
        cardinality: "single",
        enabled: true,
      },
    ];
    expect(validateRegistry(r)).toEqual([]);
  });
});
