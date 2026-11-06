/**
 * Shapes for the compiled OpenPipeline artifact. See docs/04-pipeline-compiler-spec.md
 * "Output skeleton" and "Processor ID scheme".
 */

import type { ValidationIssue } from "../config/validateRule";

export type ProcessorType = "dql" | "inlineLookup" | "securityContext";

export interface DqlProcessorBody {
  script: string;
}

export interface InlineLookupProcessorBody {
  sourceField: string;
  destinationField: string;
  /** JSON-stringified `[[[key1, key2, ...], value], ...]` -- see docs/04 Phase 2. */
  inlineLookupTable: string;
}

/** `dt.security_context` assignment: copy from an event field, or a literal. */
export interface SecurityContextProcessorBody {
  value:
    | { type: "field"; field: { sourceFieldName: string } }
    | { type: "constant"; constant: string };
}

export interface Processor {
  id: string;
  type: ProcessorType;
  enabled: boolean;
  description: string;
  matcher: string;
  dql?: DqlProcessorBody;
  inlineLookup?: InlineLookupProcessorBody;
  securityContext?: SecurityContextProcessorBody;
}

export interface PipelineStage {
  processors: Processor[];
}

export interface PipelineValue {
  customId: string;
  displayName: string;
  metadataList: unknown[];
  processing: PipelineStage;
  davis: PipelineStage;
  dataExtraction: PipelineStage;
  metricExtraction: PipelineStage;
  costAllocation: PipelineStage;
  /** Only present when the app manages the security context (otherwise left to the tenant). */
  securityContext?: PipelineStage;
}

/**
 * Reserved for future write-path concerns (e.g. a foreign-processor preservation mode, D11) --
 * empty today because this compiler only ever emits the app's own `sevassist_`-prefixed
 * processors; reconciling them with whatever else lives in the pipeline is Phase 4 deploy-path
 * work, out of scope here. Kept as an explicit third parameter so `compile`'s signature matches
 * docs/04 (`compile(rules, registry, opts)`) and does not need to change shape later.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CompilerOptions {}

export interface CompileStats {
  processorCount: number;
  /** Tracked as its own budget axis from D20 onward -- exceptions no longer compress the way
   * Default (Tier A) rules do, so this scales ~1:1 with enabled-exception count. */
  exceptionProcessorCount: number;
  /** At most 2: one inline lookup for event-name defaults, one for detector defaults. */
  defaultGroupCount: number;
  /** Total bytes across every Default inline-lookup table -- the ~100 KB platform ceiling
   * (D2/D15/D16) applies here, not to processor count. */
  defaultLookupBytes: number;
}

export type CompileResult =
  | {
      ok: true;
      pipeline: PipelineValue;
      stats: CompileStats;
      warnings: ValidationIssue[];
    }
  | { ok: false; errors: ValidationIssue[] };
