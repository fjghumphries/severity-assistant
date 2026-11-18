import {
  buildPatternQuery,
  labelBefore,
  readSample,
  refineGuess,
  toThresholdPatterns,
} from "./patternSuggestions";

describe("toThresholdPatterns", () => {
  it("anchors on the label before a numeric capture and keeps its type", () => {
    // Real output from the extractor on a test tenant.
    expect(
      toThresholdPatterns(
        "'The error rate increased to ' DOUBLE:f_5 ' ' DATA:f_6 ' ' DATA:f_7",
      ),
    ).toEqual([
      {
        pattern: "DATA 'The error rate increased to 'DOUBLE:sa_v",
        label: "The error rate increased to ",
        approximated: false,
      },
    ]);

    const long = toThresholdPatterns(
      "'Service requests have shown an unexpected slowdown to ' LONG:f_8 ' ' DATA:f_9",
    );
    expect(long).toHaveLength(1);
    expect(long[0].pattern).toMatch(/INT:sa_v$/);
    expect(long[0].pattern.startsWith("DATA '")).toBe(true);
    expect(long[0].label.length).toBeLessThanOrEqual(40);
  });

  it("offers one suggestion per number, each anchored on its own short label", () => {
    // A custom detector's description: the threshold and the triggering value.
    const got = toThresholdPatterns(
      "'!**Alert description:**\nAn anomaly was detected on CPU usage %. Within the sliding window, violations were detected that were above the threshold of ' INT:f_1 '.\nTriggering Value: ' DOUBLE:f_2 '%'",
    );
    expect(got.map((g) => g.pattern)).toEqual([
      expect.stringMatching(/^DATA '.*threshold of 'INT:sa_v$/),
      "DATA 'Triggering Value: 'DOUBLE:sa_v",
    ]);
    expect(got.every((g) => !g.pattern.includes("Alert description"))).toBe(
      true,
    );
  });

  it("falls back to a flagged INT guess when no capture is numeric", () => {
    // "...errors to 50% over the last 30 minutes" -- the extractor captured "50%" as DATA, so INT
    // reads the digits and stops at the percent sign.
    expect(
      toThresholdPatterns(
        "'increase of JavaScript errors to ' DATA:f_12 ' over the last 30 minutes'",
      ),
    ).toEqual([
      {
        pattern: "DATA 'increase of JavaScript errors to 'INT:sa_v",
        label: "increase of JavaScript errors to ",
        approximated: true,
      },
    ]);
  });

  it("offers every labelled value as a guess when none is typed as a number (real extractor output)", () => {
    // Output of the extractor for a custom CPU detector on a test tenant: both numbers are DATA.
    const got = toThresholdPatterns(
      "'!**Alert description:**\nAn anomaly was detected on CPU usage %. Within the sliding window, violations were detected that were above the threshold of ' DATA:f_22 ' Value: ' DATA:f_24",
    );
    expect(got.map((g) => g.pattern)).toEqual([
      expect.stringMatching(/^DATA '.*threshold of 'INT:sa_v$/),
      "DATA ' Value: 'INT:sa_v",
    ]);
    expect(got.every((g) => g.approximated)).toBe(true);
  });

  it("gives nothing for a pattern with no capture at all", () => {
    expect(
      toThresholdPatterns(
        "'Minimum process count not met for the rule: Petclinic is Up'",
      ),
    ).toEqual([]);
  });
});

describe("labelBefore", () => {
  it("takes the text after the last line break", () => {
    expect(labelBefore(".\nTriggering Value: ")).toBe("Triggering Value: ");
    expect(labelBefore(".\\nTriggering Value: ")).toBe("Triggering Value: ");
  });

  it("limits the label to 40 characters without starting mid-word", () => {
    const label = labelBefore(
      "Service requests have shown an unexpected slowdown to ",
    );
    expect(label.length).toBeLessThanOrEqual(40);
    expect("Service requests have shown an unexpected slowdown to ").toContain(
      label,
    );
    expect(label.startsWith("n")).toBe(false);
  });

  it("cuts after a quote, which would need escaping in a pattern", () => {
    expect(labelBefore("it's value is ")).toBe("s value is ");
  });
});

describe("refineGuess", () => {
  it("switches a guessed INT to DOUBLE when the sample number has decimals", () => {
    expect(refineGuess("DATA ' Value: 'INT:sa_v", "40.52134005228678")).toBe(
      "DATA ' Value: 'DOUBLE:sa_v",
    );
    expect(refineGuess("DATA ' Value: 'INT:sa_v", "10")).toBe(
      "DATA ' Value: 'INT:sa_v",
    );
    expect(refineGuess("DATA ' Value: 'INT:sa_v", null)).toBe(
      "DATA ' Value: 'INT:sa_v",
    );
  });
});

describe("readSample", () => {
  const sample =
    "An anomaly was detected on CPU usage %. above the threshold of 10.\nTriggering Value: 70.17441749572754%";

  it("finds the number after the label and the text around it", () => {
    expect(readSample(sample, "Triggering Value: ")).toEqual({
      reads: "70.17441749572754",
      context: "Triggering Value: 70.17441749572754%",
    });
    expect(readSample(sample, "threshold of ").reads).toBe("10");
  });

  it("returns nothing when the label is not in the sample", () => {
    expect(readSample(sample, "Failure rate: ")).toEqual({
      reads: null,
      context: "",
    });
  });
});

describe("buildPatternQuery", () => {
  it("aliases event.description to the content field the analyzer expects", () => {
    const q = buildPatternQuery("2h");
    expect(q).toContain("fetch dt.davis.events, from:-2h");
    expect(q).toContain("content = event.description");
    expect(q).not.toContain("event.name ==");
  });

  it("scopes to one event name when given, safely quoted", () => {
    expect(buildPatternQuery("24h", 'He said "hi"')).toContain(
      'event.name == "He said \\"hi\\""',
    );
    expect(buildPatternQuery("24h", "   ")).not.toContain("event.name ==");
  });
});
