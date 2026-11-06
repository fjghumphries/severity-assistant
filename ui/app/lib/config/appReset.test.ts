import { appStateKeys } from "./appReset";

describe("appStateKeys", () => {
  it("covers the shared settings and every profile's rules, default included once", () => {
    expect(appStateKeys([])).toEqual([
      "severity-assistant.role-registry.v1",
      "severity-assistant.rules.v1",
    ]);
    expect(appStateKeys(["team-a", "team-b"])).toEqual([
      "severity-assistant.role-registry.v1",
      "severity-assistant.rules.v1",
      "severity-assistant.rules.team-a.v1",
      "severity-assistant.rules.team-b.v1",
    ]);
    // A caller that includes "default" in the list must not produce a duplicate.
    expect(appStateKeys(["default", "team-a"])).toEqual(
      appStateKeys(["team-a"]),
    );
  });
});
