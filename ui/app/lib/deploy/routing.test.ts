import {
  planRemoveRoute,
  describeRouteState,
  planRoute,
  ROUTE_DESCRIPTION,
  RoutingEntry,
} from "./routing";

const entry = (
  pipelineId: string,
  o: Partial<RoutingEntry> = {},
): RoutingEntry => ({
  description: pipelineId,
  enabled: true,
  matcher: "true",
  pipelineId,
  pipelineType: "custom",
  ...o,
});

const OURS = "ours";

describe("planRoute", () => {
  test("enable adds our entry at the top and leaves every other entry untouched", () => {
    const old = entry("old", { enabled: false, matcher: "true " });
    const plan = planRoute([old], OURS, "true", "enable");
    expect(plan.entries).toHaveLength(2);
    expect(plan.entries[0]).toMatchObject({
      pipelineId: OURS,
      enabled: true,
      description: ROUTE_DESCRIPTION,
    });
    expect(plan.entries[1]).toBe(old);
    expect(plan.noChange).toBe(false);
  });

  test("an already-correct entry is a no-op", () => {
    const first = planRoute([], OURS, "true", "enable");
    expect(planRoute(first.entries, OURS, "true", "enable").noChange).toBe(
      true,
    );
  });

  test("an existing entry buried below another is moved to the top, not duplicated", () => {
    const plan = planRoute([entry("a"), entry(OURS)], OURS, "true", "enable");
    expect(plan.entries.map((e) => e.pipelineId)).toEqual([OURS, "a"]);
  });

  test("catch-all over enabled routes warns that they will starve", () => {
    const plan = planRoute([entry("a")], OURS, "true", "enable");
    expect(plan.shadowing.map((e) => e.pipelineId)).toEqual(["a"]);
    expect(plan.warnings.join(" ")).toMatch(/stop receiving/);
  });

  test("disable keeps the entry (and position) but turns it off", () => {
    const plan = planRoute([entry(OURS), entry("a")], OURS, "true", "disable");
    expect(plan.entries[0].enabled).toBe(false);
    expect(plan.entries[1].pipelineId).toBe("a");
    expect(plan.shadowing).toEqual([]);
  });

  test("unknown properties on our existing entry survive", () => {
    const plan = planRoute([entry(OURS, { extra: 1 })], OURS, "true", "enable");
    expect(plan.entries[0].extra).toBe(1);
  });
});

describe("describeRouteState", () => {
  test("absent / disabled / live", () => {
    expect(describeRouteState([entry("a")], OURS).state).toBe("absent");
    expect(
      describeRouteState([entry(OURS, { enabled: false })], OURS).state,
    ).toBe("disabled");
    expect(describeRouteState([entry(OURS)], OURS).state).toBe("live");
  });

  test("an enabled catch-all above ours is reported as shadowing it", () => {
    const s = describeRouteState([entry("a"), entry(OURS)], OURS);
    expect(s.state).toBe("shadowed");
    expect(s.shadowedBy.map((e) => e.pipelineId)).toEqual(["a"]);
  });

  test("a disabled catch-all above ours does not shadow it", () => {
    expect(
      describeRouteState([entry("a", { enabled: false }), entry(OURS)], OURS)
        .state,
    ).toBe("live");
  });
});

describe("planRemoveRoute", () => {
  it("removes only the app entry", () => {
    const r = planRemoveRoute([entry("ours"), entry("other")], "ours");
    expect(r.hadRoute).toBe(true);
    expect(r.entries.map((e) => e.pipelineId)).toEqual(["other"]);
  });

  it("reports when there was no app route", () => {
    expect(planRemoveRoute([entry("other")], "ours").hadRoute).toBe(false);
  });
});

describe("planRoute with several managed routes", () => {
  it("uses the given description and warns about other enabled app routes below it", () => {
    const current = [
      entry("other", {
        description: "Severity Assistant: Team A (managed by the app)",
      }),
    ];
    const plan = planRoute(
      current,
      "ours",
      'matchesValue(primary_tags.bu, "bu1")',
      "enable",
      "Severity Assistant: Team B (managed by the app)",
    );
    expect(plan.entries[0].description).toBe(
      "Severity Assistant: Team B (managed by the app)",
    );
    expect(plan.warnings.join(" ")).toMatch(/1 other Severity Assistant route/);
  });

  it("does not warn about unrelated routes", () => {
    const plan = planRoute(
      [entry("other")],
      "ours",
      'matchesValue(primary_tags.bu, "bu1")',
      "enable",
    );
    expect(plan.warnings.join(" ")).not.toMatch(/Severity Assistant route/);
  });
});
