import { SAFE_DEFAULT_MATCHER } from "../config/matcherPresets";
import { emptyRegistry, withRegistryDefaults } from "./registry";

describe("withRegistryDefaults", () => {
  it("turns an emptied registry into a usable, restrictive one", () => {
    const r = withRegistryDefaults({});
    expect(r.routeMatcher).toBe(SAFE_DEFAULT_MATCHER);
    expect(r.roles).toEqual([]);
    expect(r).toEqual(emptyRegistry());
  });

  it("never overrides what was stored", () => {
    const r = withRegistryDefaults({ routeMatcher: "true" });
    expect(r.routeMatcher).toBe("true");
  });
});
