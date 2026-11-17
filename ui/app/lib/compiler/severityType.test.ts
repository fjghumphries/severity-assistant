import { buildFinalCombinerProcessor } from "./processors";

const script = (mode: "leave" | "set" | "flag", write: "live" | "observe") =>
  buildFinalCombinerProcessor(
    mode === "leave" ? { mode } : { mode, value: "3" },
    write,
  ).dql?.script ?? "";

describe("severity is written as a number", () => {
  it("converts the rule result with toLong before writing", () => {
    for (const mode of ["leave", "set", "flag"] as const) {
      expect(script(mode, "live")).toContain(
        "dt.temp.sev_final = toLong(coalesce(dt.temp.sev_exception, dt.temp.sev_default))",
      );
    }
  });

  it("writes the fixed fallback as a number too", () => {
    expect(script("set", "live")).toContain(
      'event.severity = coalesce(dt.temp.sev_final, toLong("3"))',
    );
    expect(script("flag", "live")).toContain('toLong("3")');
  });

  it("observe mode records a number in sa.proposed_severity and leaves event.severity alone", () => {
    const s = script("set", "observe");
    expect(s).toContain(
      'sa.proposed_severity = coalesce(dt.temp.sev_final, toLong("3"))',
    );
    expect(s).not.toContain("fieldsAdd event.severity =");
  });

  it("leave mode keeps an untouched event's own value", () => {
    expect(script("leave", "live")).toContain(
      "event.severity = if(isNull(dt.temp.sev_final), event.severity, else: dt.temp.sev_final)",
    );
  });
});
