import { emptyRule } from "../types/rule";
import { buildThresholdScript } from "./processors";

const rule = (bounds: string) => ({
  ...emptyRule(),
  rule_type: "threshold" as const,
  parse_pattern: "DATA 'Triggering Value: 'DOUBLE:sa_v",
  threshold_bounds: bounds,
});

describe("buildThresholdScript with optional bounds", () => {
  it("a single Critical bound leaves everything below it untouched", () => {
    const s = buildThresholdScript(rule("70,,,"), "dt.temp.sev_exception");
    expect(s).toContain('if(sa_v >= 70, "1", else: dt.temp.sev_exception)');
    expect(s).not.toContain('"5"');
  });

  it("skips blank slots and keeps each value on its own severity", () => {
    const s = buildThresholdScript(rule("70,,20,"), "dt.temp.sev_default_num");
    expect(s).toContain('sa_v >= 70, "1"');
    expect(s).toContain('sa_v >= 20, "3"');
    expect(s).not.toContain('"2"');
  });

  it("all four set keeps the original Informational (5) below the lowest", () => {
    const s = buildThresholdScript(rule("50,20,10,5"), "dt.temp.sev_exception");
    expect(s).toContain('else: "5")');
  });
});
