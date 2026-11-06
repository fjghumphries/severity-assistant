import { compile } from "../lib/compiler/compile";
import { validateRule } from "../lib/config/validateRule";
import { emptyRegistry } from "../lib/types/registry";
import { fixtureCases, testProfile, testRoles, testRules } from "./fixtures";

const registry = () => ({ ...emptyRegistry(), roles: testRoles() });

describe("debug fixtures", () => {
  it("every rule is individually valid", () => {
    const issues = testRules().flatMap((r) => validateRule(r, registry()));
    expect(issues).toEqual([]);
  });

  it("the rule set compiles", () => {
    const result = compile(testRules(), registry());
    expect((result as { errors?: unknown[] }).errors ?? []).toEqual([]);
  });

  it("exception order is dense from 0", () => {
    const orders = testRules().filter((r) => r.order !== null).map((r) => r.order);
    expect(orders).toEqual(orders.map((_, i) => i));
  });

  it("the profile can only take test events and flags the rest", () => {
    const p = testProfile();
    expect(p.routeMatcher).toContain("SATEST-");
    expect(p.routeMatcher).not.toBe("true");
  });

  it("case ids are unique", () => {
    const ids = fixtureCases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
