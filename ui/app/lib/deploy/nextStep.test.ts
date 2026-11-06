import { nextStep, type NextStepInput } from "./nextStep";

const base: NextStepInput = {
  kind: "in-sync",
  route: "live",
  enabledRules: 3,
};

describe("nextStep", () => {
  it("says nothing until the live pipeline has been read", () => {
    expect(nextStep({ ...base, kind: null })).toBeNull();
  });

  it("says nothing when deployed, up to date and routed", () => {
    expect(nextStep(base)).toBeNull();
  });

  it("blocks on rule errors first and sends the user to Rules", () => {
    const n = nextStep({ ...base, kind: "errors" });
    expect(n?.tone).toBe("critical");
    expect(n?.action.to).toBe("/rules");
  });

  it("tells the user rules are saved but not active when nothing is deployed", () => {
    const n = nextStep({ ...base, kind: "not-deployed", route: null });
    expect(n?.title).toBe("Your rules are saved but not active");
    expect(n?.action.to).toBe("/pipeline");
  });

  it("does not nag an empty profile that has nothing to deploy", () => {
    expect(
      nextStep({ ...base, kind: "not-deployed", route: null, enabledRules: 0 }),
    ).toBeNull();
  });

  it("says changes are saved but the old pipeline keeps running", () => {
    const n = nextStep({ ...base, kind: "pending" });
    expect(n?.title).toBe("You have changes that are not active yet");
    expect(n?.body).toContain("as it was last deployed");
    expect(n?.action.to).toBe("/pipeline");
  });

  it("points at the route when deployed but nothing routes to it", () => {
    for (const route of ["absent", "disabled"] as const) {
      expect(nextStep({ ...base, route })?.action.label).toBe(
        "Enable the route",
      );
    }
  });

  it("treats a shadowed route as critical, since nothing will arrive", () => {
    expect(nextStep({ ...base, route: "shadowed" })?.tone).toBe("critical");
  });

  it("puts undeployed changes ahead of routing", () => {
    expect(nextStep({ ...base, kind: "pending", route: "absent" })?.title).toBe(
      "You have changes that are not active yet",
    );
  });
});
