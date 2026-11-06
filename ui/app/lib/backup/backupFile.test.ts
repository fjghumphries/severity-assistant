import { makeBackup, parseBackup } from "./backupFile";

const schemas = { pipeline: "s.pipelines", routing: "s.routing" };

describe("backup files", () => {
  it("round-trips a pipeline backup", () => {
    const b = makeBackup("pipeline", schemas.pipeline, {
      objectId: "o1",
      value: { customId: "p" },
    });
    expect(parseBackup(JSON.stringify(b), schemas)).toEqual(b);
  });

  it("accepts the legacy bare routing download", () => {
    const legacy = JSON.stringify({
      objectId: "o2",
      value: { routingEntries: [] },
    });
    const b = parseBackup(legacy, schemas);
    expect(b.kind).toBe("routing");
    expect(b.objectId).toBe("o2");
  });

  it("rejects wrong schema, non-backups and bad JSON", () => {
    const b = makeBackup("pipeline", "other.schema", {
      objectId: "o1",
      value: { customId: "p" },
    });
    expect(() => parseBackup(JSON.stringify(b), schemas)).toThrow(/expected/);
    expect(() => parseBackup('{"a":1}', schemas)).toThrow(
      /not a Severity Assistant backup/,
    );
    expect(() => parseBackup("nope", schemas)).toThrow(/valid JSON/);
  });
});

it("puts the pipeline id in the file name so profiles are told apart", async () => {
  const { backupFileName } = await import("./backupFile");
  expect(
    backupFileName(
      "pipeline",
      "2026-10-23T10:00:00.000Z",
      "pipeline_severity_assistant_team_a",
    ),
  ).toBe(
    "severity-assistant-pipeline-pipeline_severity_assistant_team_a-backup-2026-10-23T10-00-00-000Z.json",
  );
  expect(backupFileName("routing", "2026-10-23T10:00:00.000Z")).toBe(
    "severity-assistant-routing-backup-2026-10-23T10-00-00-000Z.json",
  );
});
