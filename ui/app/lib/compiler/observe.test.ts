import { emptyRegistry, type RoleRegistry } from "../types/registry";
import { emptyRule, type Rule } from "../types/rule";
import { compile } from "./compile";
import { buildFinalCombinerProcessor } from "./processors";
import { checkProcessorSyntax } from "./syntax";

const registry = (over: Partial<RoleRegistry> = {}): RoleRegistry => ({
  ...emptyRegistry(),
  ...over,
});
const rule: Rule = {
  ...emptyRule(),
  rule_id: "d1",
  name: "d1",
  event_name: "CPU",
  severity: "2",
};

const finalScript = (reg: RoleRegistry): string => {
  const r = compile([rule], reg);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  const p = r.pipeline.processing.processors.find(
    (x) => x.id === "sevassist_apply_severity",
  );
  return p?.dql?.script ?? "";
};

describe("write mode", () => {
  it("is live by default: event.severity is written", () => {
    const s = finalScript(registry());
    expect(s).toContain("fieldsAdd event.severity =");
    expect(s).not.toContain("sa.proposed_severity");
  });

  it("observe writes sa.proposed_severity and never event.severity", () => {
    const s = finalScript(registry({ writeMode: "observe" }));
    expect(s).toContain("fieldsAdd sa.proposed_severity =");
    expect(s).not.toContain("fieldsAdd event.severity");
    // the original is still recorded, and what decided it
    expect(s).toContain("sa.original_severity = event.severity");
    expect(s).toContain("sa.source");
  });

  it("observe keeps the fallback behaviour for every mode", () => {
    for (const defaultSeverity of [
      { mode: "leave" as const },
      { mode: "set" as const, value: "4" },
      { mode: "flag" as const, value: "4" },
    ]) {
      const s = finalScript(
        registry({ writeMode: "observe", defaultSeverity }),
      );
      expect(s).toContain("sa.proposed_severity");
      expect(s).not.toContain("fieldsAdd event.severity");
      if (defaultSeverity.mode === "flag") expect(s).toContain("sa.unmatched");
    }
  });

  it("says so in the processor description", () => {
    const p = buildFinalCombinerProcessor({ mode: "leave" }, "observe");
    expect(p.description).toMatch(/OBSERVE ONLY/);
    expect(p.description.length).toBeLessThan(512);
    expect(
      buildFinalCombinerProcessor({ mode: "leave" }).description,
    ).not.toMatch(/OBSERVE/);
  });

  it("the generated observe script passes the app's syntax check", () => {
    for (const mode of ["leave", "set", "flag"] as const) {
      const p = buildFinalCombinerProcessor(
        { mode, value: mode === "leave" ? undefined : "3" },
        "observe",
      );
      expect(checkProcessorSyntax([p])).toEqual([]);
    }
  });

  it("switching modes changes the compiled pipeline, so a redeploy is planned", () => {
    expect(finalScript(registry({ writeMode: "observe" }))).not.toBe(
      finalScript(registry()),
    );
  });
});
