/**
 * Compile-time guard for the restricted DQL that OpenPipeline accepts. The platform rejects a
 * save with "The function `x()` isn't enabled" for anything outside these lists, and does so
 * per field -- a function that is fine in a processor script (`arrayFirst`, `contains`) is
 * rejected in a `matcher`. Catching it here turns a deploy-time 400 into a compile error.
 *
 * Sources (checked 2026-10-23):
 *  - matchers: docs.dynatrace.com/docs/platform/openpipeline/reference/dql-matcher-in-openpipeline
 *  - script commands: .../openpipeline/reference/openpipeline-dql-commands
 *  - script functions: .../openpipeline/reference/dql/openpipeline-dql-functions
 * `dtctl create settings --validate-only` is the authoritative check against a live tenant.
 */

import type { ValidationIssue } from "../config/validateRule";
import type { Processor } from "./types";

/** Functions and logical keywords allowed in a `matcher`. `==`/comparisons are operators. */
export const MATCHER_FUNCTIONS: ReadonlySet<string> = new Set(
  [
    "matchesPhrase",
    "matchesValue",
    "isNull",
    "isNotNull",
    "duration",
    "iAny",
    "and",
    "or",
    "not",
  ].map((s) => s.toLowerCase()),
);

/** Commands allowed in a DQL processor script. */
export const SCRIPT_COMMANDS: ReadonlySet<string> = new Set(
  [
    "parse",
    "jsonExtract",
    "fields",
    "fieldsKeep",
    "fieldsAdd",
    "fieldsRemove",
    "fieldsRename",
    "fieldsFlatten",
  ].map((s) => s.toLowerCase()),
);

const SCRIPT_FUNCTION_NAMES = `
concat contains decodeUrl encodeUrl endsWith escape getCharacter indexOf lastIndexOf levenshteinDistance like lower
matchesPattern matchesPhrase matchesValue parse parseAll punctuation replacePattern replaceString splitByPattern
splitString startsWith stringLength substring trim unescape unescapeHtml upper
asArray asBinary asBoolean asDouble asDuration asIp asLong asNumber asRecord asSmartscapeId toSmartscapeId asString
asTimeframe asTimestamp asUid decode encode getHighBits getLowBits hexStringToNumber isUid128 isUid64 isUuid
numberToHexString smartscapeId toArray toBoolean toDouble toDuration toIp toLong toString toTimeframe toTimestamp
toUid type uid128 uid64 uuid
coalesce if isFalseOrNull isNotNull isNull isTrueOrNull
duration formatTimestamp getDayOfMonth getDayOfWeek getDayOfYear getEnd getHour getMinute getMonth getStart getSecond
getYear getWeekOfYear now timeframe timestamp timestampFromUnixMillis timestampFromUnixNanos
timestampFromUnixSeconds unixMillisFromTimestamp unixNanosFromTimestamp unixSecondsFromTimestamp
array arrayAvg arrayConcat arrayCumulativeSum arrayDelta arrayDistinct arrayFirst arrayFlatten arrayIndexOf arrayLast
arrayLastIndexOf arrayMax arrayMedian arrayMin arrayMovingAvg arrayMovingMax arrayMovingMin arrayMovingSum
arrayPercentile arrayRemoveNulls arrayReverse arraySize arraySort arraySum
ip ipIn ipIsLinkLocal ipIsLoopback ipIsPrivate ipIsPublic ipMask isIp isIpV4 isIpV6
hashCrc32 hashMd5 hashSha1 hashSha256 hashSha512 hashXxHash32 hashXxHash64
bitwiseAnd bitwiseCountOnes bitwiseNot bitwiseShiftLeft bitwiseShiftRight bitwiseOr bitwiseXor
abs acos asin atan atan2 bin ceil cos cosh cbrt degreeToRadian e exp floor hypotenuse log log1p log10 pi power
radianToDegree random range round signum sin sinh sqrt tan tanh
exists in record
vectorInnerProductDistance vectorL1Distance vectorL2Distance vectorCosineDistance
and or not
`;

/** Functions allowed in a DQL processor script. */
export const SCRIPT_FUNCTIONS: ReadonlySet<string> = new Set(
  SCRIPT_FUNCTION_NAMES.split(/\s+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase()),
);

/** Removes double-quoted string literals so user values (event names, tag values, DPL patterns)
 * are never mistaken for function calls. */
const stripStrings = (s: string): string =>
  s.replace(/"(?:[^"\\]|\\.)*"/g, '""');

/** Identifiers directly followed by `(` -- i.e. function calls. */
function calledFunctions(expr: string): string[] {
  return [...stripStrings(expr).matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(
    (m) => m[1],
  );
}

/** Human-readable problems with a route/processor matcher (empty = fine): functions the platform
 * rejects in matchers, caught before a write instead of by it. */
export function matcherProblems(matcher: string): string[] {
  return calledFunctions(matcher)
    .filter((fn) => !MATCHER_FUNCTIONS.has(fn.toLowerCase()))
    .map(
      (fn) =>
        `${fn}() is not allowed in a matcher (allowed: matchesValue, matchesPhrase, isNull, isNotNull, duration).`,
    );
}

export function checkProcessorSyntax(
  processors: Processor[],
): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  for (const p of processors) {
    for (const fn of calledFunctions(p.matcher)) {
      if (!MATCHER_FUNCTIONS.has(fn.toLowerCase())) {
        errors.push({
          field: "matcher",
          message: `${p.id}: function ${fn}() is not allowed in an OpenPipeline matcher (allowed: matchesValue, matchesPhrase, isNull, isNotNull, duration).`,
        });
      }
    }
    const script = p.dql?.script;
    if (script === undefined) continue;
    const bare = stripStrings(script);
    for (const segment of bare.split("|")) {
      const command = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(segment)?.[1];
      if (command && !SCRIPT_COMMANDS.has(command.toLowerCase())) {
        errors.push({
          field: "script",
          message: `${p.id}: command ${command} is not supported in an OpenPipeline DQL processor.`,
        });
      }
    }
    for (const fn of calledFunctions(script)) {
      if (!SCRIPT_FUNCTIONS.has(fn.toLowerCase())) {
        errors.push({
          field: "script",
          message: `${p.id}: function ${fn}() is not available in OpenPipeline DQL.`,
        });
      }
    }
  }
  return errors;
}
