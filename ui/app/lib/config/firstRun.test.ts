import { emptyRegistry } from "../types/registry";
import { validateRegistry } from "./validateRegistry";
import { firstRunRegistry, needsSetup } from "./firstRun";

describe("first run", () => {
  it("starts from the four built-in labels, all mapped and valid", () => {
    const r = firstRunRegistry();
    expect(r.roles.map((x) => x.label)).toEqual([
      "Business Unit",
      "Application",
      "Tier",
      "Stage",
    ]);
    expect(validateRegistry(r)).toEqual([]);
  });

  it("needs setup until a label is usable, and not before the registry has loaded", () => {
    expect(needsSetup(null)).toBe(false);
    expect(needsSetup(emptyRegistry())).toBe(true);
    expect(needsSetup(firstRunRegistry())).toBe(false);
  });

  it("a label with no field, or switched off, does not count as set up", () => {
    const r = firstRunRegistry();
    r.roles = r.roles.map((x) => ({ ...x, field: "" }));
    expect(needsSetup(r)).toBe(true);
    const off = firstRunRegistry();
    off.roles = off.roles.map((x) => ({ ...x, enabled: false }));
    expect(needsSetup(off)).toBe(true);
  });
});
