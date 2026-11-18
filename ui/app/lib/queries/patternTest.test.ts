import {
  buildLatestSampleQuery,
  buildPatternTestQuery,
  explainMiss,
  interpretTestRecords,
  patternShapeProblem,
} from "./patternTest";

const SAMPLE =
  "!**Alert description:**\nAn anomaly on CPU usage %. above the threshold of 10\nTriggering Value: 75.18556626637776";

describe("patternShapeProblem", () => {
  it("requires the number to be captured as sa_v", () => {
    expect(patternShapeProblem("DATA 'Value: 'INT:sa_v")).toBeNull();
    expect(patternShapeProblem("DATA 'Value: 'DOUBLE : sa_v")).toBeNull();
    expect(patternShapeProblem("DATA 'Value: 'INT:x")).toMatch(/sa_v/);
    expect(patternShapeProblem("DATA 'Value: '")).toMatch(/sa_v/);
  });
});

describe("buildPatternTestQuery", () => {
  it("quotes the sample and the pattern safely, newlines and quotes included", () => {
    const q = buildPatternTestQuery(
      'a "b"\nTriggering Value: 5',
      "DATA 'Triggering Value: 'INT:sa_v",
    );
    expect(q).toContain('content = "a \\"b\\"\\nTriggering Value: 5"');
    expect(q).toContain("parse content, \"DATA 'Triggering Value: 'INT:sa_v\"");
    expect(q).toContain("fields sa_v");
  });
});

describe("explainMiss", () => {
  it("names the missing space inside the quotes (the real slip)", () => {
    const hint = explainMiss(SAMPLE, "DATA 'Triggering Value:' INT:sa_v");
    expect(hint).toMatch(/followed by a space/);
    expect(hint).toContain("'Triggering Value: '");
  });

  it("says when the label is not in the description", () => {
    expect(explainMiss(SAMPLE, "DATA 'Failure rate: 'INT:sa_v")).toMatch(
      /does not contain "Failure rate: "/,
    );
  });

  it("says what follows the label when it is not a number", () => {
    expect(
      explainMiss(
        "Triggering Value: high",
        "DATA 'Triggering Value: 'INT:sa_v",
      ),
    ).toMatch(/continues with "high"/);
  });

  it("has nothing to say for a pattern without a label", () => {
    expect(explainMiss(SAMPLE, "INT:sa_v")).toBeNull();
  });
});

describe("interpretTestRecords", () => {
  it("reads the captured value, as text", () => {
    expect(interpretTestRecords([{ sa_v: 75.19 }], SAMPLE, "x")).toEqual({
      status: "reads",
      value: "75.19",
    });
    expect(interpretTestRecords([{ sa_v: "75" }], SAMPLE, "x")).toEqual({
      status: "reads",
      value: "75",
    });
  });

  it("is 'nothing' when the capture is missing or empty, with the explanation", () => {
    const r = interpretTestRecords(
      [{}],
      SAMPLE,
      "DATA 'Triggering Value:' INT:sa_v",
    );
    expect(r.status).toBe("nothing");
    expect(interpretTestRecords([], SAMPLE, "x").status).toBe("nothing");
    expect(interpretTestRecords([{ sa_v: null }], SAMPLE, "x").status).toBe(
      "nothing",
    );
    if (r.status === "nothing") expect(r.hint).toMatch(/space/);
  });
});

describe("buildLatestSampleQuery", () => {
  it("targets the detector when there is one, else the event name, else nothing", () => {
    expect(buildLatestSampleQuery({ detectorId: "abc" })).toContain(
      'dt.settings.object_id == "abc"',
    );
    expect(buildLatestSampleQuery({ eventName: 'He said "hi"' })).toContain(
      'event.name == "He said \\"hi\\""',
    );
    expect(buildLatestSampleQuery({ eventName: "  " })).toBeNull();
    expect(buildLatestSampleQuery({})).toBeNull();
  });
});
