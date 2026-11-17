import {
  allBoundsSet,
  boundsProblem,
  parseBounds,
  summarizeBounds,
} from "./bounds";

describe("threshold bounds", () => {
  it("keeps each value in its severity slot", () => {
    expect(parseBounds("70,,,")).toEqual([70, null, null, null]);
    expect(parseBounds(",,20,10")).toEqual([null, null, 20, 10]);
    expect(parseBounds(null)).toEqual([null, null, null, null]);
  });

  it("accepts one or more values and the legacy four", () => {
    expect(boundsProblem("70,,,")).toBeNull();
    expect(boundsProblem("70,,20,")).toBeNull();
    expect(boundsProblem("50,20,10,5")).toBeNull();
  });

  it("rejects none, non-descending and non-numeric", () => {
    expect(boundsProblem(",,,")).not.toBeNull();
    expect(boundsProblem(null)).not.toBeNull();
    expect(boundsProblem("20,50,,")).not.toBeNull();
    expect(boundsProblem("20,20,,")).not.toBeNull();
    expect(boundsProblem("a,,,")).not.toBeNull();
    expect(boundsProblem("5,4,3,2,1")).not.toBeNull();
  });

  it("only treats a full set as giving Informational below the lowest", () => {
    expect(allBoundsSet(parseBounds("50,20,10,5"))).toBe(true);
    expect(allBoundsSet(parseBounds("70,,,"))).toBe(false);
  });

  it("summarises for display", () => {
    expect(summarizeBounds("70,,,")).toBe("Critical >= 70");
    expect(summarizeBounds("50,20,10,5")).toContain("else Informational");
  });
});
