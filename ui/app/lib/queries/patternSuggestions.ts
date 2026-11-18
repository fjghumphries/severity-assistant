/**
 * Threshold-pattern suggestions derived from the event descriptions the tenant actually produces,
 * instead of only the hand-written presets.
 *
 * `dt.statistics.clustering.LogPatternExtractor` clusters free text into DPL patterns. It reads
 * `event.description` once it is aliased to `content` (verified on a test tenant, docs/11), and returns
 * patterns with typed captures, e.g.
 *   'The error rate increased to ' DOUBLE:f_5 ' ' DATA:f_6 ' ' DATA:f_7 ...
 * A threshold rule needs the number in a capture named exactly `sa_v` and nothing after it, so the
 * raw pattern is rewritten, shortened to the label before the number, before it can be offered. The rewrite is pure and unit-tested; only
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
  /** The number this pattern reads from the sample, e.g. "70.17", or null if it could not be found. */
  reads: string | null;
  /** The part of the sample around that number, e.g. "Triggering Value: 70.17%". */
  context: string;
  /** The capture was not numeric in the original pattern, so `INT` is a best guess. */
  approximated: boolean;
}

const NUMERIC = new Set(["INT", "LONG", "DOUBLE", "FLOAT"]);
const MAX_LABEL = 40;

type Token =
  { kind: "literal"; text: string } | { kind: "capture"; type: string };

/** Splits an extractor pattern into its quoted literals and typed captures. */
function tokenize(expression: string): Token[] {
  const re =
    /'((?:\\.|[^'\\])*)'|\b(INT|LONG|DOUBLE|FLOAT|DATA|IPADDR|TIMESTAMP|STRING)\s*:\s*[A-Za-z_][A-Za-z0-9_]*/g;
  const tokens: Token[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(expression)) !== null) {
    if (m[1] !== undefined) tokens.push({ kind: "literal", text: m[1] });
    else tokens.push({ kind: "capture", type: m[2].toUpperCase() });
  }
  return tokens;
}

/**
 * The short label right before a number: the end of the literal text, after its last line break,
 * at most 40 characters and not starting mid-word. "...detected.\nTriggering Value: " gives
 * "Triggering Value: ". A literal with a quote or a backslash in it is cut after the last one, since
 * those would need escaping inside the pattern.
 */
export function labelBefore(literal: string): string {
  let t = literal.split(/\\n|\r?\n/).pop() ?? "";
  t = t.slice(Math.max(t.lastIndexOf("'"), t.lastIndexOf("\\")) + 1);
  if (t.length > MAX_LABEL) {
    const cut = t.length - MAX_LABEL;
    const space = t.indexOf(" ", cut);
    t = space === -1 ? t.slice(cut) : t.slice(space + 1);
  }
  return t;
}

/**
 * Turns one extracted pattern into threshold patterns, one per number it can read. Each is short and
 * anchored on the label before the number, so it does not depend on the rest of the description:
 * `DATA 'Triggering Value: 'DOUBLE:sa_v`. A numeric capture keeps its type (LONG becomes INT). If the
 * pattern has no numeric capture, every captured value with a label is offered as a flagged guess (INT
 * reads the digits and stops at a percent sign). A pattern with nothing to read gives [].
 */
export function toThresholdPatterns(
  patternExpression: string,
): { pattern: string; label: string; approximated: boolean }[] {
  const tokens = tokenize(patternExpression);
  const labelled = (i: number): string | null => {
    const prev = tokens[i - 1];
    if (!prev || prev.kind !== "literal") return null;
    const label = labelBefore(prev.text);
    return label.trim() === "" ? null : label;
  };
  const out: { pattern: string; label: string; approximated: boolean }[] = [];
  tokens.forEach((t, i) => {
    if (t.kind !== "capture" || !NUMERIC.has(t.type)) return;
    const label = labelled(i);
    if (label === null) return;
    const type = t.type === "LONG" ? "INT" : t.type;
    out.push({
      pattern: `DATA '${label}'${type}:sa_v`,
      label,
      approximated: false,
    });
  });
  if (out.length > 0) return out;
  // No capture is typed as a number (the extractor often reports "50%" or "70.17" as plain text):
  // offer every captured value that has a label as a flagged guess, and let the user pick.
  tokens.forEach((t, i) => {
    if (t.kind !== "capture") return;
    const label = labelled(i);
    if (label === null) return;
    out.push({ pattern: `DATA '${label}'INT:sa_v`, label, approximated: true });
  });
  return out;
}

/** A guessed `INT` becomes `DOUBLE` when the sample number has decimals, so it is not cut at the point. */
export function refineGuess(pattern: string, reads: string | null): string {
  return reads !== null && /[.,]/.test(reads)
    ? pattern.replace(/INT:sa_v$/, "DOUBLE:sa_v")
    : pattern;
}

/** The number a label is followed by in a sample description, and the text around it. */
export function readSample(
  sample: string,
  label: string,
): { reads: string | null; context: string } {
  const at = sample.indexOf(label);
  if (at === -1) return { reads: null, context: "" };
  const after = sample.slice(at + label.length);
  const m = /^\s*(-?\d+(?:[.,]\d+)?)/.exec(after);
  if (!m) return { reads: null, context: "" };
  const end = at + label.length + m[0].length;
  return {
    reads: m[1],
    context: sample.slice(at, Math.min(sample.length, end + 8)).trim(),
  };
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
    const sample = o.sampleMatches?.[0] ?? "";
    for (const rewritten of toThresholdPatterns(expression)) {
      const read = readSample(sample, rewritten.label);
      const pattern = rewritten.approximated
        ? refineGuess(rewritten.pattern, read.reads)
        : rewritten.pattern;
      if (seen.has(pattern)) continue;
      seen.add(pattern);
      suggestions.push({
        pattern,
        approximated: rewritten.approximated,
        matches: o.numberOfMatches ?? 0,
        sample,
        ...read,
      });
    }
  }
  return suggestions.sort((a, b) => b.matches - a.matches).slice(0, limit);
}
