import { buildDeployPlan, LivePipeline } from "./plan";
import type { PipelineValue, Processor } from "../compiler/types";

const proc = (id: string, script = "fieldsAdd a = 1"): Processor => ({
  id,
  type: "dql",
  enabled: true,
  description: id,
  matcher: "true",
  dql: { script },
});

const compiled = (...processors: Processor[]): PipelineValue => ({
  customId: "pipeline_severity_assistant_v1",
  displayName: "Severity Assistant (generated -- do not edit)",
  metadataList: [],
  processing: { processors },
  davis: { processors: [] },
  dataExtraction: { processors: [] },
  metricExtraction: { processors: [] },
  costAllocation: { processors: [] },
});

const liveOf = (value: Record<string, unknown>): LivePipeline => ({
  objectId: "obj1",
  updateToken: "tok1",
  value: { customId: "pipeline_severity_assistant_v1", ...value },
});

describe("buildDeployPlan", () => {
  test("no live object -> create, everything is added", () => {
    const plan = buildDeployPlan(
      compiled(proc("sevassist_a"), proc("sevassist_zz_combine")),
      null,
    );
    expect(plan.mode).toBe("create");
    expect(plan.added).toEqual(["sevassist_a", "sevassist_zz_combine"]);
    expect(plan.changed).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.noChange).toBe(false);
    expect(plan.merged.groupRole).toBeNull();
  });

  test("identical live content -> noChange", () => {
    const c = compiled(proc("sevassist_a"));
    const live = liveOf({
      displayName: c.displayName,
      metadataList: [],
      processing: { processors: [proc("sevassist_a")] },
      davis: { processors: [] },
      dataExtraction: { processors: [] },
      metricExtraction: { processors: [] },
      costAllocation: { processors: [] },
    });
    const plan = buildDeployPlan(c, live);
    expect(plan.mode).toBe("update");
    expect(plan.noChange).toBe(true);
    expect(plan.unchangedCount).toBe(1);
  });

  test("diff separates added / changed / removed owned processors", () => {
    const live = liveOf({
      processing: {
        processors: [
          proc("sevassist_keep"),
          proc("sevassist_edit", "old"),
          proc("sevassist_gone"),
        ],
      },
    });
    const plan = buildDeployPlan(
      compiled(
        proc("sevassist_keep"),
        proc("sevassist_edit", "new"),
        proc("sevassist_new"),
      ),
      live,
    );
    expect(plan.added).toEqual(["sevassist_new"]);
    expect(plan.changed).toEqual(["sevassist_edit"]);
    expect(plan.removed).toEqual(["sevassist_gone"]);
    expect(plan.unchangedCount).toBe(1);
    expect(plan.noChange).toBe(false);
  });

  test("D11: foreign processors are preserved verbatim, after the owned ones, in every stage", () => {
    const foreignProc = {
      id: "someone_elses",
      type: "dql",
      enabled: true,
      matcher: "true",
      dql: { script: "x" },
    };
    const foreignDavis = {
      id: "davis_thing",
      type: "dql",
      enabled: true,
      matcher: "true",
      dql: { script: "y" },
    };
    const live = liveOf({
      processing: { processors: [foreignProc, proc("sevassist_old")] },
      davis: { processors: [foreignDavis] },
    });
    const plan = buildDeployPlan(
      compiled(proc("sevassist_a"), proc("sevassist_zz_combine")),
      live,
    );

    expect(plan.merged.processing?.processors?.map((p) => p.id)).toEqual([
      "sevassist_a",
      "sevassist_zz_combine",
      "someone_elses",
    ]);
    expect(plan.merged.processing?.processors?.[2]).toEqual(foreignProc);
    expect((plan.merged.davis as { processors: unknown[] }).processors).toEqual(
      [foreignDavis],
    );
    expect(plan.foreign).toEqual([
      { stage: "processing", id: "someone_elses" },
      { stage: "davis", id: "davis_thing" },
    ]);
    expect(plan.removed).toEqual(["sevassist_old"]);
  });

  test("unrelated live properties (groupRole, displayName) survive an update", () => {
    const live = liveOf({
      groupRole: "r1",
      displayName: "Renamed by a human",
      processing: { processors: [] },
    });
    const plan = buildDeployPlan(compiled(proc("sevassist_a")), live);
    expect(plan.merged.groupRole).toBe("r1");
    expect(plan.merged.displayName).toBe("Renamed by a human");
  });

  test("property order in the live object does not cause a spurious change", () => {
    const live = liveOf({
      processing: {
        processors: [
          {
            matcher: "true",
            dql: { script: "fieldsAdd a = 1" },
            description: "sevassist_a",
            enabled: true,
            type: "dql",
            id: "sevassist_a",
          },
        ],
      },
    });
    const plan = buildDeployPlan(compiled(proc("sevassist_a")), live);
    expect(plan.changed).toEqual([]);
    expect(plan.unchangedCount).toBe(1);
  });
});

describe("buildDeployPlan: stages beyond processing", () => {
  const withSecurity = (...p: Processor[]): PipelineValue => ({
    ...compiled(proc("sevassist_a")),
    securityContext: { processors: p },
  });
  const secProc: Processor = {
    id: "sevassist_security_context",
    type: "securityContext",
    enabled: true,
    description: "ctx",
    matcher: "true",
    securityContext: { value: { type: "constant", constant: "teamA" } },
  };

  test("foreign processors in every stage are listed, not just the original five", () => {
    const live = liveOf({
      processing: { processors: [proc("sevassist_a")] },
      storage: {
        processors: [{ id: "someone_bucket", type: "bucketAssignment" }],
      },
      security: { processors: [{ id: "someone_sec", type: "dql" }] },
    });
    const plan = buildDeployPlan(compiled(proc("sevassist_a")), live);
    expect(plan.foreign).toEqual(
      expect.arrayContaining([
        { stage: "storage", id: "someone_bucket" },
        { stage: "security", id: "someone_sec" },
      ]),
    );
    // ...and they are preserved in what would be written.
    expect(
      (plan.merged.storage as { processors: unknown[] }).processors,
    ).toHaveLength(1);
  });

  test("a stage the live pipeline lacks and the app does not use is not invented", () => {
    const live = liveOf({
      processing: { processors: [proc("sevassist_a")] },
      davis: { processors: [] },
      dataExtraction: { processors: [] },
      metricExtraction: { processors: [] },
      costAllocation: { processors: [] },
    });
    const plan = buildDeployPlan(compiled(proc("sevassist_a")), live);
    expect(plan.noChange).toBe(true);
    expect(plan.merged.storage).toBeUndefined();
  });

  test("an app-managed security context shows as added, then as removed when switched off", () => {
    const empty = liveOf({ processing: { processors: [proc("sevassist_a")] } });
    const added = buildDeployPlan(withSecurity(secProc), empty);
    expect(added.added).toEqual(["sevassist_security_context"]);

    const live = liveOf({
      processing: { processors: [proc("sevassist_a")] },
      securityContext: { processors: [secProc] },
    });
    const off = buildDeployPlan(compiled(proc("sevassist_a")), live);
    expect(off.removed).toEqual(["sevassist_security_context"]);
    expect(
      (off.merged.securityContext as { processors: unknown[] }).processors,
    ).toEqual([]);
  });
});
