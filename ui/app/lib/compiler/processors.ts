/**
 * Processor builders, one per phase in docs/04-pipeline-compiler-spec.md's "Compiler algorithm
 * (updated for D19/D20)". Each function is pure and side-effect free.
 */

import { DefaultSeverity, SecurityContextSetting } from "../types/registry";
import { RoleRegistry } from "../types/registry";
import { Rule } from "../types/rule";
import {
  buildMatcher,
  dqlStringLiteral,
  ruleTarget,
  TargetFamily,
} from "./keys";
import { Processor } from "./types";
import {
  describeBands,
  describeFallback,
  describeTarget,
  describeWhen,
  THRESHOLD_SOURCE,
  withPrefix,
} from "./wording";

const SA_CAPTURE = "sa_v";

function dqlProcessor(
  id: string,
  description: string,
  matcher: string,
  script: string,
): Processor {
  return {
    id,
    type: "dql",
    enabled: true,
    description,
    matcher,
    dql: { script },
  };
}

function lookupProcessor(
  id: string,
  description: string,
  sourceField: string,
  destinationField: string,
  inlineLookupTable: string,
): Processor {
  return {
    id,
    type: "inlineLookup",
    enabled: true,
    description,
    matcher: "true",
    inlineLookup: { sourceField, destinationField, inlineLookupTable },
  };
}

// ---------------------------------------------------------------------------
// Default grouping: one inline lookup per target family
// ---------------------------------------------------------------------------

/**
 * Keyed Defaults that share a target field, so they share one inline-lookup processor. D19 gives
 * Defaults zero role conditions, so the key is just the target value and the lookup reads the
 * target field directly -- no key-building processor, no composite key, no hashing.
 */
export interface DefaultGroup {
  family: TargetFamily;
  /** The Grail field the lookup reads: `event.name` or `dt.settings.object_id`. */
  field: string;
  rules: Rule[];
}

/** Partitions keyed Defaults into at most two groups: by event name and by anomaly detector. */
export function groupDefaultsByTarget(defaultsKeyed: Rule[]): DefaultGroup[] {
  const map = new Map<TargetFamily, DefaultGroup>();
  for (const rule of defaultsKeyed) {
    const target = ruleTarget(rule);
    if (!target) continue; // should not happen: validateRule requires a target on Defaults
    const group = map.get(target.family) ?? {
      family: target.family,
      field: target.field,
      rules: [],
    };
    group.rules.push(rule);
    map.set(target.family, group);
  }
  // Deterministic order -- correctness does not depend on it (D15/D19).
  return [...map.values()].sort((a, b) => a.family.localeCompare(b.family));
}

// ---------------------------------------------------------------------------
// Phase 1 -- threshold rules (shared shape for Default and Exception)
// ---------------------------------------------------------------------------

/**
 * The `parse` + guarded `>=` if-chain shared by threshold Defaults and threshold Exceptions
 * (docs/04 Phase 1 and Phase 3). `rule.parse_pattern` must capture into the fixed name `sa_v`
 * (validated at the compiler level, see `validate.ts`) so this function does not need to parse
 * the user's DPL pattern to discover the capture name itself.
 */
export function buildThresholdScript(rule: Rule, targetField: string): string {
  const bounds = (rule.threshold_bounds ?? "")
    .split(",")
    .map((s) => s.trim())
    .map(Number);
  const severities = ["1", "2", "3", "4"];

  let chain = '"5"';
  for (let i = bounds.length - 1; i >= 0; i--) {
    chain = `if(${SA_CAPTURE} >= ${bounds[i]}, "${severities[i]}", else: ${chain})`;
  }
  const assign = `if(isNull(${SA_CAPTURE}), ${targetField}, else: ${chain})`;

  return [
    `parse event.description, ${dqlStringLiteral(rule.parse_pattern ?? "")}`,
    `fieldsAdd ${targetField} = ${assign}`,
    `fieldsRemove ${SA_CAPTURE}`,
  ].join("\n| ");
}

export function buildDefaultThresholdProcessor(
  rule: Rule,
  registry: RoleRegistry,
  destinationField = "dt.temp.sev_default_num",
): Processor {
  return dqlProcessor(
    `sevassist_threshold_${rule.rule_id}`,
    withPrefix(
      `set default severity for ${describeTarget(rule)}${describeWhen(rule, registry)}, ${THRESHOLD_SOURCE} (${describeBands(rule)})`,
    ),
    buildMatcher(rule, registry),
    buildThresholdScript(rule, destinationField),
  );
}

// ---------------------------------------------------------------------------
// Phase 2 -- one inline lookup per Default signature
// ---------------------------------------------------------------------------

/** `destinationField` is the final field when there are no threshold Defaults to merge with. */
export function buildInlineLookupProcessor(
  group: DefaultGroup,
  destinationField: string,
): Processor {
  // Compress by severity: multiple keys can map to one value. D19's unique-target validation
  // means every key within a group is already distinct, so no key can appear under two
  // severities.
  const bySeverity = new Map<string, string[]>();
  for (const rule of group.rules) {
    const target = ruleTarget(rule);
    if (!target) continue; // should not happen: Defaults always have a target
    const key = target.value;
    const severity = rule.severity ?? "";
    const keys = bySeverity.get(severity) ?? [];
    keys.push(key);
    bySeverity.set(severity, keys);
  }

  const entries: [string[], string][] = [...bySeverity.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([severity, keys]) => [[...keys].sort(), severity]);
  const inlineLookupTable = JSON.stringify(entries);

  const by = group.family === "DET" ? "anomaly detector" : "event name";
  const idBy = group.family === "DET" ? "detector" : "event_name";
  const n = group.rules.length;
  const shown = group.rules
    .slice(0, 3)
    .map((r) =>
      group.family === "DET" ? r.name || r.detector_id : r.event_name,
    )
    .join(", ");
  return lookupProcessor(
    `sevassist_default_by_${idBy}`,
    withPrefix(
      `set default severity by ${by} for ${n} rule${n === 1 ? "" : "s"} (${shown}${n > 3 ? `, +${n - 3} more` : ""})`,
    ),
    group.field,
    destinationField,
    inlineLookupTable,
  );
}

// ---------------------------------------------------------------------------
// Phase 2.5 -- combine the two Default sub-results
// ---------------------------------------------------------------------------

export function buildDefaultCombinerProcessor(): Processor {
  return dqlProcessor(
    "sevassist_default_combine",
    withPrefix(
      "pick the default severity: the event-name or detector match, otherwise the threshold default",
    ),
    "true",
    "fieldsAdd dt.temp.sev_default = coalesce(dt.temp.sev_default_keyed, dt.temp.sev_default_num)",
  );
}

// ---------------------------------------------------------------------------
// Phase 3 -- one processor per enabled exception, in `order`
// ---------------------------------------------------------------------------

export function buildExceptionProcessor(
  rule: Rule,
  registry: RoleRegistry,
): Processor {
  const order = rule.order ?? 0;
  // The id deliberately does NOT carry `order`: execution order comes from the processor array
  // (docs/01 section 6), so keeping the id stable makes a pure reorder show up as
  // `orderChanged` with zero adds/removes instead of remove+add of every shifted exception.
  const id = `sevassist_exception_${rule.rule_id}`;
  const what =
    rule.rule_type === "threshold"
      ? `set severity ${THRESHOLD_SOURCE} (${describeBands(rule)})`
      : `set severity ${rule.severity ?? ""}`;
  const description = withPrefix(
    `exception #${order} - ${what} for ${describeTarget(rule)}${describeWhen(rule, registry)}`,
  );
  const matcher = buildMatcher(rule, registry);

  if (rule.rule_type === "threshold") {
    return dqlProcessor(
      id,
      description,
      matcher,
      buildThresholdScript(rule, "dt.temp.sev_exception"),
    );
  }
  const script = `fieldsAdd dt.temp.sev_exception = ${dqlStringLiteral(rule.severity ?? "")}`;
  return dqlProcessor(id, description, matcher, script);
}

// ---------------------------------------------------------------------------
// Phase 4 -- the combiner
// ---------------------------------------------------------------------------

export function buildFinalCombinerProcessor(
  defaultSeverity: DefaultSeverity,
): Processor {
  // Markers make the app's effect measurable afterwards (Results screen): which tier decided
  // ("exception" / "default" / "unmatched") and the severity the event arrived with. The original
  // must be captured before event.severity is overwritten below.
  const lines = [
    "fieldsAdd dt.temp.sev_final = coalesce(dt.temp.sev_exception, dt.temp.sev_default)",
    "fieldsAdd sa.original_severity = event.severity",
    'fieldsAdd sa.source = if(isNotNull(dt.temp.sev_exception), "exception", else: if(isNotNull(dt.temp.sev_default), "default", else: "unmatched"))',
  ];

  if (defaultSeverity.mode === "leave") {
    lines.push(
      "fieldsAdd event.severity = if(isNull(dt.temp.sev_final), event.severity, else: dt.temp.sev_final)",
    );
  } else {
    const value = dqlStringLiteral(defaultSeverity.value ?? "");
    lines.push(
      `fieldsAdd event.severity = coalesce(dt.temp.sev_final, ${value})`,
    );
    if (defaultSeverity.mode === "flag") {
      lines.push("fieldsAdd sa.unmatched = isNull(dt.temp.sev_final)");
    }
  }

  return dqlProcessor(
    "sevassist_apply_severity",
    withPrefix(
      `write event.severity from the last matching exception, otherwise the default; events matching neither ${describeFallback(defaultSeverity)}`,
    ),
    "true",
    lines.join("\n| "),
  );
}

// ---------------------------------------------------------------------------
// Security context stage
// ---------------------------------------------------------------------------

export const SECURITY_CONTEXT_PROCESSOR_ID = "sevassist_security_context";

/** One processor in the `securityContext` stage, or null when the app is not managing it. */
export function buildSecurityContextProcessor(
  setting: SecurityContextSetting | undefined,
): Processor | null {
  if (!setting || setting.mode === "none") return null;
  const v = (setting.value ?? "").trim();
  const value =
    setting.mode === "field"
      ? ({ type: "field", field: { sourceFieldName: v } } as const)
      : ({ type: "constant", constant: v } as const);
  return {
    id: SECURITY_CONTEXT_PROCESSOR_ID,
    type: "securityContext",
    enabled: true,
    description:
      setting.mode === "field"
        ? `Severity Assistant: set dt.security_context from ${v}`
        : `Severity Assistant: set dt.security_context to "${v}"`,
    matcher: "true",
    securityContext: { value },
  };
}

// ---------------------------------------------------------------------------
// Output skeleton
// ---------------------------------------------------------------------------

export function pipelineSkeleton(
  processors: Processor[],
  customId: string,
  securityContext: Processor[] = [],
  displayName = "Severity Assistant (generated -- do not edit)",
): import("./types").PipelineValue {
  return {
    customId,
    displayName,
    metadataList: [],
    processing: { processors },
    davis: { processors: [] },
    dataExtraction: { processors: [] },
    metricExtraction: { processors: [] },
    costAllocation: { processors: [] },
    ...(securityContext.length > 0
      ? { securityContext: { processors: securityContext } }
      : {}),
  };
}
