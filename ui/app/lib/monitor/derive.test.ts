import {
  byDetector,
  classify,
  effectiveSeverity,
  isObserved,
  filterOptions,
  filterRows,
  normalizeRows,
  onlyPipeline,
  pipelineDisplayName,
  pipelineKey,
  splitBy,
  timeSeriesBy,
  toDiscoveryRows,
  totals,
  transitions,
  withPipelineLabels,
} from "./derive";
import type { MonitorRow } from "./query";

const row = (o: Partial<MonitorRow>): MonitorRow => ({
  t: "2026-10-23T10:00:00.000Z",
  detector: null,
  "event.name": "E",
  "event.category": null,
  bu: null,
  app: null,
  tier: null,
  stage: null,
  "event.severity": "3",
  "sa.source": null,
  "sa.original_severity": null,
  pipeline: "davis.events:pipeline_severity_assistant_v1",
  c: 1,
  ...o,
});

const rows = [
  row({ c: 5 }), // not processed
  row({ "sa.source": "default", "sa.original_severity": "3", c: 2 }), // processed, unchanged
  row({
    "sa.source": "exception",
    "sa.original_severity": "3",
    "event.severity": "1",
    c: 3,
    bu: "bu1",
    detector: "d1",
  }),
  row({
    "sa.source": "unmatched",
    "sa.original_severity": "3",
    c: 4,
    "event.name": "Other",
  }),
];

it("classifies and totals", () => {
  expect(classify(rows[0])).toBe("unprocessed");
  expect(classify(rows[1])).toBe("unchanged");
  expect(classify(rows[2])).toBe("modified");
  expect(totals(rows)).toEqual({
    total: 14,
    processed: 9,
    modified: 3,
    unmatched: 4,
    observed: 0,
  });
});

it("splits by a dimension and by detector", () => {
  const split = splitBy(rows, "bu", (id) => id);
  expect(split.find((s) => s.category === "bu1")).toMatchObject({
    modified: 3,
    total: 3,
  });
  expect(split.find((s) => s.category === "(not set)")?.total).toBe(11);
  expect(byDetector(rows, () => "Detector One")[1]).toMatchObject({
    detector: "Detector One",
    events: 3,
    modified: 3,
  });
});

it("lists severity transitions of modified events only", () => {
  expect(transitions(rows)).toEqual([{ from: "3", to: "1", events: 3 }]);
});

it("fills empty buckets with zero", () => {
  const hour = 3_600_000;
  const s = timeSeriesBy(
    [
      row({ t: "2026-10-23T10:00:00.000Z", c: 2 }),
      row({ t: "2026-10-23T12:00:00.000Z", c: 4 }),
    ],
    hour,
    () => "all",
  );
  expect(s[0].datapoints.map((d) => d.value)).toEqual([2, 0, 4]);
});

it("simulates from the original severity of processed events", () => {
  const d = toDiscoveryRows(rows);
  expect(
    d.find((x) => x["event.name"] === "E" && x.bu === "bu1")?.[
      "event.severity"
    ],
  ).toBe("3");
});

it("coerces string counts so sums stay numeric", () => {
  const raw = [
    row({ c: "5" as unknown as number }),
    row({ c: "2" as unknown as number }),
  ];
  expect(totals(normalizeRows(raw)).total).toBe(7);
});

it("filters rows by selected labels across dimensions", () => {
  const name = (id: string) => id;
  expect(filterRows(rows, {}, name)).toHaveLength(rows.length);
  expect(totals(filterRows(rows, { bu: ["bu1"] }, name)).total).toBe(3);
  expect(
    totals(filterRows(rows, { bu: ["bu1"], detector: ["d2"] }, name)).total,
  ).toBe(0);
  expect(filterOptions(rows, "bu", name)[0]).toEqual({
    value: "(not set)",
    count: 11,
  });
});

describe("pipeline helpers", () => {
  const names = new Map([
    ["pipeline_severity_assistant_v1", "Default"],
    ["pipeline_severity_assistant_team_a", "Team A"],
  ]);
  const rows2 = [
    row({ c: 5 }),
    row({ pipeline: "davis.events:pipeline_severity_assistant_team_a", c: 3 }),
    row({ pipeline: "davis.events:default", c: 2 }),
    row({ pipeline: null, c: 1 }),
  ];

  it("names the app's pipelines by profile and the platform's by what they are", () => {
    expect(pipelineDisplayName("pipeline_severity_assistant_v1", names)).toBe(
      "Default",
    );
    expect(pipelineDisplayName("default", names)).toBe("Built-in default");
    expect(pipelineDisplayName("someone_elses", names)).toBe("someone_elses");
    expect(pipelineDisplayName("", names)).toBe("(no pipeline recorded)");
  });

  it("keeps only the events one pipeline processed", () => {
    expect(
      onlyPipeline(rows2, "pipeline_severity_assistant_team_a").map((r) => r.c),
    ).toEqual([3]);
    expect(pipelineKey(rows2[0])).toBe("pipeline_severity_assistant_v1");
  });

  it("splits a bar by pipeline when asked, and by outcome otherwise", () => {
    const labelled = withPipelineLabels(rows2, names);
    const byPipeline = splitBy(
      labelled,
      "severity",
      (id) => id,
      12,
      (r) => r.pipelineLabel ?? "",
    );
    expect(byPipeline[0].segments).toEqual({
      Default: 5,
      "Team A": 3,
      "Built-in default": 2,
      "(no pipeline recorded)": 1,
    });
    const byOutcome = splitBy(labelled, "severity", (id) => id);
    expect(byOutcome[0].segments).toEqual({ "Not processed": 11 });
  });

  it("offers Pipeline as a dimension and labels it", () => {
    const labelled = withPipelineLabels(rows2, names);
    expect(
      splitBy(labelled, "pipeline", (id) => id)
        .map((e) => e.category)
        .sort(),
    ).toEqual(
      [
        "(no pipeline recorded)",
        "Built-in default",
        "Default",
        "Team A",
      ].sort(),
    );
  });
});

describe("observe mode rows", () => {
  const row = (
    over: Partial<import("./query").MonitorRow>,
  ): import("./query").MonitorRow => ({
    t: "2026-01-01T00:00:00Z",
    detector: null,
    "event.name": "CPU",
    "event.category": null,
    bu: null,
    app: null,
    tier: null,
    stage: null,
    pipeline: "davis.events:pipeline_severity_assistant_v1",
    "event.severity": "5",
    "sa.source": "default",
    "sa.original_severity": "5",
    c: 3,
    ...over,
  });

  it("an observe-mode event is 'modified' when its proposal differs, though event.severity is untouched", () => {
    const r = row({ "sa.proposed_severity": "2" });
    expect(classify(r)).toBe("modified");
    expect(effectiveSeverity(r)).toBe("2");
    expect(isObserved(r)).toBe(true);
  });

  it("is unchanged when the proposal equals what it arrived with", () => {
    expect(classify(row({ "sa.proposed_severity": "5" }))).toBe("unchanged");
  });

  it("live rows behave as before", () => {
    const live = row({ "event.severity": "2" });
    expect(classify(live)).toBe("modified");
    expect(effectiveSeverity(live)).toBe("2");
    expect(isObserved(live)).toBe(false);
  });

  it("totals count observed events separately", () => {
    const t = totals([row({ "sa.proposed_severity": "2" }), row({ c: 4 })]);
    expect(t).toMatchObject({
      total: 7,
      processed: 7,
      modified: 3,
      observed: 3,
    });
  });
});
