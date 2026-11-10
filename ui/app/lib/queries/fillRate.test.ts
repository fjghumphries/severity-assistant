import {
  buildFillRateQuery,
  isProbeableField,
  probeFields,
  readFillRates,
} from "./fillRate";

describe("fill rate", () => {
  it("accepts plain dotted identifiers only", () => {
    expect(isProbeableField("primary_tags.bu")).toBe(true);
    expect(isProbeableField("k8s.namespace.name")).toBe(true);
    expect(isProbeableField("a b")).toBe(false);
    expect(isProbeableField("x) | fetch logs //")).toBe(false);
    expect(isProbeableField("")).toBe(false);
    expect(isProbeableField("1abc")).toBe(false);
  });

  it("returns null when nothing can be probed", () => {
    expect(buildFillRateQuery(["", "bad field"])).toBeNull();
  });

  it("builds one summarize over distinct fields", () => {
    const q = buildFillRateQuery(
      ["primary_tags.bu", " primary_tags.bu ", "env.name"],
      "24h",
    ) as string;
    expect(q).toContain("from:-24h");
    expect(q.match(/countIf/g)).toHaveLength(2);
    expect(q).toContain("f1 = countIf(isNotNull(coalesce(arrayFirst(env.name)");
  });

  it("reads rates, and 0 when there were no events", () => {
    const fields = ["a", "b"];
    expect(readFillRates(fields, { total: 200, f0: 50, f1: 200 })).toEqual({
      a: 0.25,
      b: 1,
    });
    expect(readFillRates(fields, { total: 0, f0: 0, f1: 0 })).toEqual({
      a: 0,
      b: 0,
    });
    expect(readFillRates(fields, undefined)).toEqual({});
    expect(probeFields(["a", "a", "b"])).toEqual(["a", "b"]);
  });
});
