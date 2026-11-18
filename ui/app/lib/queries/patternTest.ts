/**
 * Tests a by-value pattern against a real event description, so a pattern that reads nothing is
 * caught when it is typed instead of silently doing nothing in production (a missing space inside
 * the quotes is enough).
 *
 * The test runs the pattern through DQL (`data record(...) | parse content, "<pattern>"`), which uses
 * the same pattern parser as the pipeline's `parse` (checked on a test tenant, same results as the
 * processor preview) and scans no stored data. The helpers that build the query and explain a miss
 * are pure; only the two `run`/`fetch` functions touch the SDK.
 */

import { queryExecutionClient } from "@dynatrace-sdk/client-query";

export type PatternTestResult =
  | { status: "reads"; value: string }
  | { status: "nothing"; hint: string | null }
  | { status: "invalid"; message: string };

/** The one thing every threshold pattern must do: capture the number into `sa_v`. */
export function patternShapeProblem(pattern: string): string | null {
  if (!/:\s*sa_v\b/.test(pattern))
    return "The pattern must capture the number as sa_v, for example INT:sa_v or DOUBLE:sa_v (as in DATA 'Value: 'DOUBLE:sa_v).";
  return null;
}

const lit = (s: string) => JSON.stringify(s);

/** The DQL that runs `pattern` on `sample` and returns what it captured into `sa_v`. */
export function buildPatternTestQuery(sample: string, pattern: string): string {
  return `data record(content = ${lit(sample)})
| parse content, ${lit(pattern)}
| fields sa_v`;
}

/** The first quoted piece of text in a pattern: the label that anchors it. */
function firstLiteral(pattern: string): string | null {
  const m = /'((?:\\.|[^'\\])*)'/.exec(pattern);
  return m ? m[1] : null;
}

/**
 * Why a pattern read nothing, in words: the label is missing from the description, the number does
 * not follow it, or (the common slip) whitespace sits between the label and the number but not
 * inside the quotes, because spaces between pattern parts are ignored.
 */
export function explainMiss(sample: string, pattern: string): string | null {
  const label = firstLiteral(pattern);
  if (label === null || label === "") return null;
  const at = sample.indexOf(label);
  if (at === -1)
    return `The description does not contain "${label}". Check the text before the number.`;
  const after = sample.slice(at + label.length);
  const gap = /^\s+/.exec(after);
  if (gap && /^\s+[-+]?\d/.test(after) && !/\s$/.test(label)) {
    const what = gap[0].includes("\n") ? "a line break" : "a space";
    return `In the description, "${label.trim()}" is followed by ${what} before the number. Put it inside the quotes: '${label}${gap[0].includes("\n") ? "\\n" : " "}'.`;
  }
  const next = after.trimStart().slice(0, 20);
  return next === ""
    ? `Nothing follows "${label}" in the description.`
    : `After "${label}" the description continues with "${next}", which is not a number.`;
}

/** Turns the first result record into a verdict. */
export function interpretTestRecords(
  records: Record<string, unknown>[],
  sample: string,
  pattern: string,
): PatternTestResult {
  const v = records[0]?.sa_v;
  if (typeof v === "number" || typeof v === "string") {
    const value = String(v);
    if (value !== "") return { status: "reads", value };
  }
  return { status: "nothing", hint: explainMiss(sample, pattern) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs the test. An unparsable pattern comes back as `invalid` with the platform's message. */
export async function runPatternTest(
  sample: string,
  pattern: string,
): Promise<PatternTestResult> {
  const shape = patternShapeProblem(pattern);
  if (shape) return { status: "invalid", message: shape };
  try {
    let res = await queryExecutionClient.queryExecute({
      body: {
        query: buildPatternTestQuery(sample, pattern),
        requestTimeoutMilliseconds: 8000,
      },
    });
    for (
      let i = 0;
      i < 10 && res.state === "RUNNING" && res.requestToken;
      i++
    ) {
      await sleep(300);
      res = await queryExecutionClient.queryPoll({
        requestToken: res.requestToken,
      });
    }
    if (res.state !== "SUCCEEDED")
      return { status: "invalid", message: "The test did not finish." };
    return interpretTestRecords(
      (res.result?.records ?? []) as Record<string, unknown>[],
      sample,
      pattern,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      status: "invalid",
      message: `The pattern could not be parsed: ${message}`,
    };
  }
}

/** The DQL for the latest description of one event name or detector (short window, one row). */
export function buildLatestSampleQuery(target: {
  eventName?: string | null;
  detectorId?: string | null;
}): string | null {
  const cond = target.detectorId
    ? `dt.settings.object_id == ${lit(target.detectorId)}`
    : target.eventName?.trim()
      ? `event.name == ${lit(target.eventName.trim())}`
      : null;
  if (!cond) return null;
  return `fetch dt.davis.events, from:-2h
| filter ${cond} and isNotNull(event.description)
| sort timestamp desc
| limit 1
| fields event.description`;
}

/** The most recent description of the rule's event or detector in the last two hours, or null. */
export async function fetchLatestSample(target: {
  eventName?: string | null;
  detectorId?: string | null;
}): Promise<string | null> {
  const query = buildLatestSampleQuery(target);
  if (!query) return null;
  let res = await queryExecutionClient.queryExecute({
    body: { query, requestTimeoutMilliseconds: 15000 },
  });
  for (let i = 0; i < 20 && res.state === "RUNNING" && res.requestToken; i++) {
    await sleep(500);
    res = await queryExecutionClient.queryPoll({
      requestToken: res.requestToken,
    });
  }
  const d = (res.result?.records?.[0] as Record<string, unknown> | undefined)?.[
    "event.description"
  ];
  return typeof d === "string" && d !== "" ? d : null;
}
