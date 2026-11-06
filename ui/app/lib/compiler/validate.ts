/**
 * Compiler-level validation -- budgets and per-processor length limits that only exist once
 * rules have been compiled into processors. Rule-level and cross-rule checks (severity format,
 * duplicate targets, order density, etc.) live in `../config/validateRule.ts` and run BEFORE
 * compilation; see docs/04-pipeline-compiler-spec.md's validation table for the full list this
 * file and `validateRule.ts` together implement.
 */

import { isException, Rule } from "../types/rule";
import type { ValidationIssue } from "../config/validateRule";
import { Processor } from "./types";

const MAX_PROCESSORS = 1000;
const WARN_PROCESSORS = 800;
const MAX_LOOKUP_BYTES = 100_000;
const WARN_LOOKUP_BYTES = 80_000;
const MAX_MATCHER_CHARS = 4096;
const MAX_SCRIPT_CHARS = 8192;
const MAX_DESCRIPTION_CHARS = 512;

export interface CompilerValidation {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/**
 * Runs every budget/length check against an already-built processor list. Deliberately
 * post-build rather than a prospective estimate, so the numbers being checked (processor
 * count, matcher/script lengths, lookup-table bytes) are exactly what would be written --
 * "validation error, not a truncated pipeline" (docs/04's testing section).
 */
export function validateCompiledPipeline(
  processors: Processor[],
  active: Rule[],
): CompilerValidation {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const exceptionCount = active.filter(isException).length;

  if (processors.length > MAX_PROCESSORS) {
    errors.push({
      field: "budget",
      message: `Compiled pipeline would have ${processors.length} processors, over the ${MAX_PROCESSORS} platform limit.`,
    });
  } else if (processors.length > WARN_PROCESSORS) {
    warnings.push({
      field: "budget",
      message: `Compiled pipeline has ${processors.length} processors, approaching the ${MAX_PROCESSORS} platform limit.`,
    });
  }

  // D20: exception-processor count is tracked as its own budget axis, separate from the
  // Default byte budget below -- exceptions no longer compress into a shared lookup table.
  if (exceptionCount > MAX_PROCESSORS) {
    errors.push({
      field: "budget",
      message: `${exceptionCount} enabled exceptions would need ${exceptionCount} processors, over the ${MAX_PROCESSORS} platform limit.`,
    });
  } else if (exceptionCount > WARN_PROCESSORS) {
    warnings.push({
      field: "budget",
      message: `${exceptionCount} enabled exceptions, approaching the ${MAX_PROCESSORS}-processor limit on this budget axis.`,
    });
  }

  const lookupBytes = processors
    .filter((p) => p.type === "inlineLookup")
    .reduce(
      (sum, p) => sum + (p.inlineLookup?.inlineLookupTable.length ?? 0),
      0,
    );
  if (lookupBytes > MAX_LOOKUP_BYTES) {
    errors.push({
      field: "budget",
      message: `Default inline-lookup tables total ${lookupBytes} bytes, over the ${MAX_LOOKUP_BYTES}-byte platform limit.`,
    });
  } else if (lookupBytes > WARN_LOOKUP_BYTES) {
    warnings.push({
      field: "budget",
      message: `Default inline-lookup tables total ${lookupBytes} bytes, approaching the ${MAX_LOOKUP_BYTES}-byte limit.`,
    });
  }

  for (const p of processors) {
    if (p.matcher.length > MAX_MATCHER_CHARS) {
      errors.push({
        field: "matcher",
        message: `Processor "${p.id}" matcher is ${p.matcher.length} chars, over the ${MAX_MATCHER_CHARS}-char limit.`,
      });
    }
    if (p.dql && p.dql.script.length > MAX_SCRIPT_CHARS) {
      errors.push({
        field: "script",
        message: `Processor "${p.id}" script is ${p.dql.script.length} chars, over the ${MAX_SCRIPT_CHARS}-char limit.`,
      });
    }
    if (!p.description.trim()) {
      errors.push({
        field: "description",
        message: `Processor "${p.id}" has a blank description.`,
      });
    } else if (p.description.length > MAX_DESCRIPTION_CHARS) {
      errors.push({
        field: "description",
        message: `Processor "${p.id}" description is ${p.description.length} chars, over the ${MAX_DESCRIPTION_CHARS}-char limit.`,
      });
    }
  }

  return { errors, warnings };
}
