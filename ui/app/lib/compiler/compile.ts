/**
 * `compile(rules, registry, opts): CompileResult` -- a pure function, no I/O, no randomness, no
 * clock reads. Same rules in, byte-identical pipeline out. See
 * docs/04-pipeline-compiler-spec.md's "Compiler algorithm (updated for D19/D20)" -- this file
 * follows that pseudocode directly.
 */

import {
  findDuplicateDefaultTargets,
  findDuplicateRules,
  findExceptionOrderConflicts,
  validateRule,
  ValidationIssue,
} from "../config/validateRule";
import { isException, Rule } from "../types/rule";
import { RoleRegistry } from "../types/registry";
import {
  buildDefaultCombinerProcessor,
  buildDefaultThresholdProcessor,
  buildExceptionProcessor,
  buildFinalCombinerProcessor,
  buildInlineLookupProcessor,
  buildSecurityContextProcessor,
  groupDefaultsByTarget,
  pipelineSkeleton,
} from "./processors";
import { CompileResult, CompilerOptions, Processor } from "./types";
import { checkProcessorSyntax } from "./syntax";
import { validateCompiledPipeline } from "./validate";

/** A threshold rule's `parse_pattern` must capture into this fixed name so the compiler can
 * build the `>=` if-chain without needing to parse the user's own DPL pattern to discover
 * whatever capture name they typed (docs/04 Phase 1's compiled-output example uses this name
 * literally). Enforced here rather than in `validateRule.ts` because it is a compiler
 * implementation detail, not a product-level rule constraint. */
const SA_CAPTURE_RE = /:sa_v\b/;

function ruleLevelErrors(
  active: Rule[],
  registry: RoleRegistry,
): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  for (const rule of active) {
    errors.push(...validateRule(rule, registry));
  }
  errors.push(...findDuplicateRules(active));
  errors.push(...findDuplicateDefaultTargets(active));
  errors.push(...findExceptionOrderConflicts(active));

  for (const rule of active) {
    if (
      rule.rule_type === "threshold" &&
      !SA_CAPTURE_RE.test(rule.parse_pattern ?? "")
    ) {
      errors.push({
        field: "parse_pattern",
        message: `${rule.name}: parse_pattern must capture into "sa_v" (e.g. INT:sa_v) so the compiler can build its threshold chain.`,
      });
    }
  }
  return errors;
}

export function compile(
  rules: Rule[],
  registry: RoleRegistry,
  _opts: CompilerOptions = {},
): CompileResult {
  void _opts; // reserved, see types.ts -- no compiler behaviour depends on it yet.

  const active = rules.filter((r) => r.enabled);

  const errors = ruleLevelErrors(active, registry);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const defaults = active.filter((r) => !isException(r));
  const exceptions = [...active.filter((r) => isException(r))].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );

  const defaultsKeyed = [
    ...defaults.filter((r) => r.rule_type === "keyed"),
  ].sort((a, b) => a.rule_id.localeCompare(b.rule_id));
  const defaultsThreshold = [
    ...defaults.filter((r) => r.rule_type === "threshold"),
  ].sort((a, b) => a.rule_id.localeCompare(b.rule_id));

  const defaultGroups = groupDefaultsByTarget(defaultsKeyed);

  // The keyed lookups and the threshold Defaults write to separate fields and are merged, but only
  // when both kinds exist; with just one kind the lookup writes the final field directly and the
  // merge processor is not emitted at all.
  const needsMerge = defaultGroups.length > 0 && defaultsThreshold.length > 0;
  const keyedDestination = needsMerge
    ? "dt.temp.sev_default_keyed"
    : "dt.temp.sev_default";

  const processors: Processor[] = [];

  // One processor per threshold Default, stable order by rule_id.
  for (const rule of defaultsThreshold) {
    processors.push(
      buildDefaultThresholdProcessor(
        rule,
        registry,
        needsMerge ? "dt.temp.sev_default_num" : "dt.temp.sev_default",
      ),
    );
  }

  // One inline lookup per target family (event name / anomaly detector), reading that field directly.
  for (const group of defaultGroups) {
    processors.push(buildInlineLookupProcessor(group, keyedDestination));
  }

  if (needsMerge) {
    processors.push(buildDefaultCombinerProcessor());
  }

  // Phase 3 -- one processor per enabled exception, in D20's explicit `order`.
  for (const rule of exceptions) {
    processors.push(buildExceptionProcessor(rule, registry));
  }

  // Phase 4 -- the combiner. Always present, even for an empty rule set (an inert pipeline).
  processors.push(buildFinalCombinerProcessor(registry.defaultSeverity));

  const syntaxErrors = checkProcessorSyntax(processors);
  if (syntaxErrors.length > 0) {
    return { ok: false, errors: syntaxErrors };
  }

  const { errors: budgetErrors, warnings } = validateCompiledPipeline(
    processors,
    active,
  );
  if (budgetErrors.length > 0) {
    return { ok: false, errors: budgetErrors };
  }

  const securityContext = buildSecurityContextProcessor(
    registry.securityContext,
  );
  const pipeline = pipelineSkeleton(
    processors,
    registry.pipelineCustomId,
    securityContext ? [securityContext] : [],
    registry.pipelineDisplayName,
  );
  const defaultLookupBytes = processors
    .filter((p) => p.type === "inlineLookup")
    .reduce(
      (sum, p) => sum + (p.inlineLookup?.inlineLookupTable.length ?? 0),
      0,
    );

  return {
    ok: true,
    pipeline,
    warnings,
    stats: {
      processorCount: processors.length,
      exceptionProcessorCount: exceptions.length,
      defaultGroupCount: defaultGroups.length,
      defaultLookupBytes,
    },
  };
}
