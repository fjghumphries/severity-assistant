/**
 * Threshold-pattern suggestions derived from the event descriptions the tenant actually produces,
 * instead of only the hand-written presets.
 *
 * `dt.statistics.clustering.LogPatternExtractor` clusters free text into DPL patterns. It reads
 * `event.description` once it is aliased to `content` (verified on a test tenant, docs/11), and returns
 * patterns with typed captures, e.g.
 *   'The error rate increased to ' DOUBLE:f_5 ' ' DATA:f_6 ' ' DATA:f_7 ...
 * A threshold rule needs the number in a capture named exactly `sa_v` and nothing after it, so the
 * raw pattern is rewritten before it can be offered. The rewrite is pure and unit-tested; only
 * `fetchPatternSuggestions` touches the SDK.
 */

import { analyzersClient } from "@dynatrace-sdk/client-davis-analyzers";

import type { DiscoveryWindow } from "../types/discovery";

export const PATTERN_ANALYZER = "dt.statistics.clustering.LogPatternExtractor";

export interface PatternSuggestion {
  /** Ready to store as `parse_pattern`: one `sa_v` capture, nothing after it. */
  pattern: string;
  /** How many event descriptions the original cluster matched. */
  matches: number;
  /** One real description from the cluster, so the user can see what it reads. */
  sample: string;
  /** The capture was not numeric in the original pattern, so `INT` is a best guess. */
  approximated: boolean;
}

/** `DOUBLE:f_5` -> keep DOUBLE; `LONG`/`INT` -> INT; anything else (usually DATA) -> INT, flagged. */
const CAPTURE =
  /\b(INT|LONG|DOUBLE|FLOAT|DATA|IPADDR|TIMESTAMP|STRING)\s*:\s*[A-Za-z_][A-Za-z0-9_]*/;

const NUMERIC = new Set(["INT", "LONG", "DOUBLE", "FLOAT"]);

/**
 * Rewrites one extracted pattern into a threshold pattern, or returns null when it has no capture
 * at all (a cluster of identical literal descriptions -- nothing to read a number from).
 *
 * Everything after the first capture is dropped: DPL `parse` matches a prefix, so the tail only
 * makes the pattern more brittle. A non-numeric capture becomes `INT:sa_v`, which still works when
 * the text is like "50%" (INT consumes the digits and stops), but is flagged as a guess.
 */
export function toThresholdPattern(
  patternExpression: string,
): { pattern: string; approximated: boolean } | null {
  const match = CAPTURE.exec(patternExpression);
  if (!match) return null;
  const type = match[1].toUpperCase();
  const numeric = NUMERIC.has(type);
  const head = patternExpression.slice(0, match.index);
  const capture = `${numeric && type !== "LONG" ? type : "INT"}:sa_v`;
  return { pattern: `${head}${capture}`.trim(), approximated: !numeric };
}

interface ExtractorOutput {
  patternExpression?: string;
  numberOfMatches?: number;
  sampleMatches?: string[];
}

/** The DQL handed to the analyzer: event descriptions aliased to the `content` field it expects. */
export function buildPatternQuery(
  window: DiscoveryWindow,
  eventName?: string | null,
): string {
  const nameFilter = eventName?.trim()
    ? ` and event.name == ${JSON.stringify(eventName.trim())}`
    : "";
  return `fetch dt.davis.events, from:-${window}
| filter isNotNull(event.description)${nameFilter}
| fields timestamp, content = event.description`;
}

/**
 * Runs the extractor and returns only the clusters a threshold rule could use, most frequent first.
 * Throws with the platform's message -- the caller shows it rather than failing silently (the app
 * needs the `davis:analyzers:execute` scope for this).
 */
export async function fetchPatternSuggestions(
  window: DiscoveryWindow,
  eventName?: string | null,
  limit = 12,
): Promise<PatternSuggestion[]> {
  const result = await analyzersClient.executeAnalyzer({
    analyzerName: PATTERN_ANALYZER,
    body: {
      // The analyzer takes the DQL as a plain string, not an object (docs/11).
      logQuery: buildPatternQuery(window, eventName),
      numberOfExamples: 1,
    },
    timeoutSeconds: 30,
  });

  const output = (result.result?.output ?? []) as ExtractorOutput[];
  const suggestions: PatternSuggestion[] = [];
  const seen = new Set<string>();
  for (const o of output) {
    const expression = o.patternExpression;
    if (!expression) continue;
    const rewritten = toThresholdPattern(expression);
    if (!rewritten || seen.has(rewritten.pattern)) continue;
    seen.add(rewritten.pattern);
    suggestions.push({
      pattern: rewritten.pattern,
      approximated: rewritten.approximated,
      matches: o.numberOfMatches ?? 0,
      sample: o.sampleMatches?.[0] ?? "",
    });
  }
  return suggestions.sort((a, b) => b.matches - a.matches).slice(0, limit);
}
