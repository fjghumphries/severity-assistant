import { buildPatternQuery, toThresholdPattern } from "./patternSuggestions";

describe("toThresholdPattern", () => {
  it("keeps a numeric capture's type and drops everything after it", () => {
    // Real output from the extractor on a test tenant.
    expect(
      toThresholdPattern(
        "'The error rate increased to ' DOUBLE:f_5 ' ' DATA:f_6 ' ' DATA:f_7",
      ),
    ).toEqual({
      pattern: "'The error rate increased to ' DOUBLE:sa_v",
      approximated: false,
    });

    expect(
      toThresholdPattern(
        "'Service requests have shown an unexpected slowdown to ' LONG:f_8 ' ' DATA:f_9",
      ),
    ).toEqual({
      pattern:
        "'Service requests have shown an unexpected slowdown to ' INT:sa_v",
      approximated: false,
    });
  });

  it("falls back to INT for a non-numeric capture and flags it", () => {
    // "...errors to 50% over the last 30 minutes" -- the extractor captured "50%" as DATA, so INT
    // reads the digits and stops at the percent sign.
    expect(
      toThresholdPattern(
        "'increase of JavaScript errors to ' DATA:f_12 ' over the last 30 minutes'",
      ),
    ).toEqual({
      pattern: "'increase of JavaScript errors to ' INT:sa_v",
      approximated: true,
    });
  });

  it("rejects a pattern with no capture at all", () => {
    expect(
      toThresholdPattern(
        "'Minimum process count not met for the rule: Petclinic is Up'",
      ),
    ).toBeNull();
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
