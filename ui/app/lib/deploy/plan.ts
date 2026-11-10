/**
 * Deploy planning (Phase 4, docs/04 "Write protocol" + D11): given the freshly compiled
 * pipeline and whatever is currently live under the app's `customId`, work out exactly what a
 * save would add / change / remove, and build the object that would be written.
 *
 * Pure -- no SDK imports, no I/O -- so it is unit-testable without a tenant, same as the
 * compiler. Reading the live object and writing the result live in `usePipelineDeploy.ts`.
 *
 * Ownership rule (D11): processors whose id starts with `sevassist_` belong to the app and are
 * fully replaced by the compiled output. Anything else is foreign and is preserved verbatim,
 * appended after the app's processors. It is never silently dropped.
 */

import type { PipelineValue, Processor } from "../compiler/types";

export const OWNED_PREFIX = "sevassist_";

/** Every stage the Davis-events pipeline schema defines (builtin:openpipeline.davis.events.pipelines).
 * All of them are scanned for foreign processors so nothing a user added is ever silently dropped
 * or omitted from the diff; only the CORE_STAGES, plus any stage the app emits into or the live
 * pipeline already has, are rewritten on a save. */
export const PIPELINE_STAGES = [
  "processing",
  "davis",
  "dataExtraction",
  "metricExtraction",
  "costAllocation",
  "securityContext",
  "security",
  "storage",
  "productAllocation",
  "smartscapeNodeExtraction",
  "smartscapeEdgeExtraction",
] as const;

const CORE_STAGES: ReadonlySet<string> = new Set([
  "processing",
  "davis",
  "dataExtraction",
  "metricExtraction",
  "costAllocation",
]);

/** Processors read back from the tenant are opaque beyond their id -- they may be of types the
 * compiler never emits, so they are carried through untouched. */
export type LiveProcessor = { id: string } & Record<string, unknown>;

/** The `value` of the live `builtin:openpipeline.davis.events.pipelines` object. Only the
 * parts the planner reasons about are typed; everything else (groupRole, metadataList, ...)
 * rides along via the index signature and is preserved on update. */
export interface LivePipelineValue {
  customId: string;
  displayName?: string;
  processing?: { processors?: LiveProcessor[] };
  [key: string]: unknown;
}

export interface LivePipeline {
  objectId: string;
  /** Optimistic-concurrency token from the read; sent back on write so a concurrent edit is
   * rejected instead of overwritten (V5). */
  updateToken: string;
  value: LivePipelineValue;
}

/** One leaf-level difference, `path` is dotted (e.g. `inlineLookup.inlineLookupTable`). */
export interface FieldDiff {
  path: string;
  before: unknown;
  after: unknown;
}

export interface ProcessorChange {
  id: string;
  kind: "added" | "changed" | "removed";
  /** Leaf differences; for added/removed, every leaf of the processor (before/after undefined). */
  fields: FieldDiff[];
}

export interface DeployPlan {
  mode: "create" | "update";
  /** Per-processor detail behind added/changed/removed, in the order they will appear. */
  processorChanges: ProcessorChange[];
  /** Non-processor pipeline settings (displayName, metadataList, groupRole, ...) that differ. */
  otherChanges: FieldDiff[];
  /** Same processors in the processing stage, but in a different order than live. */
  orderChanged: boolean;
  /** Owned processor ids that are new / differ from live / disappear. */
  added: string[];
  changed: string[];
  removed: string[];
  unchangedCount: number;
  /** Foreign processors that will be kept (and where they were found). */
  foreign: { stage: string; id: string }[];
  /** True when an update would write byte-identical content -- nothing to do. */
  noChange: boolean;
  /** The object to write. */
  merged: LivePipelineValue;
}

export const isOwned = (id: string): boolean => id.startsWith(OWNED_PREFIX);

/** Stable stringify (sorted keys) so equality is independent of property order the platform
 * may return. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Leaf-level diff of two JSON values. A missing side is `undefined`. */
export function diffValues(
  before: unknown,
  after: unknown,
  path = "",
): FieldDiff[] {
  const isObj = (v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  if (isObj(before) || isObj(after)) {
    const b = (isObj(before) ? before : {}) as Record<string, unknown>;
    const a = (isObj(after) ? after : {}) as Record<string, unknown>;
    if (
      (before !== undefined && !isObj(before)) ||
      (after !== undefined && !isObj(after))
    ) {
      return [{ path, before, after }];
    }
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
    return keys.flatMap((k) =>
      diffValues(b[k], a[k], path ? `${path}.${k}` : k),
    );
  }
  return canonical(before) === canonical(after)
    ? []
    : [{ path, before, after }];
}

function stageProcessors(
  value: LivePipelineValue | PipelineValue,
  stage: string,
): LiveProcessor[] {
  const s = (value as Record<string, unknown>)[stage] as
    { processors?: LiveProcessor[] } | undefined;
  return s?.processors ?? [];
}

export function buildDeployPlan(
  compiled: PipelineValue,
  live: LivePipeline | null,
): DeployPlan {
  // Processors the compiler emits, per stage (processing, and securityContext when managed).
  // Owned processors found live in a stage that is no longer emitted are stale and removable;
  // foreign ones in any stage are kept.
  const ownedByStage: Record<string, LiveProcessor[]> = {};
  for (const stage of PIPELINE_STAGES)
    ownedByStage[stage] = stageProcessors(compiled, stage);
  const ownedNew = PIPELINE_STAGES.flatMap((stage) => ownedByStage[stage]);
  const liveOwned = new Map<string, LiveProcessor>();
  const foreign: { stage: string; id: string }[] = [];
  if (live) {
    for (const stage of PIPELINE_STAGES) {
      for (const p of stageProcessors(live.value, stage)) {
        if (isOwned(p.id)) liveOwned.set(p.id, p);
        else foreign.push({ stage, id: p.id });
      }
    }
  }

  const added: string[] = [];
  const changed: string[] = [];
  let unchangedCount = 0;
  for (const p of ownedNew) {
    const existing = liveOwned.get(p.id);
    if (!existing) added.push(p.id);
    else if (canonical(existing) !== canonical(p)) changed.push(p.id);
    else unchangedCount += 1;
  }
  const newIds = new Set(ownedNew.map((p) => p.id));
  const removed = [...liveOwned.keys()].filter((id) => !newIds.has(id));

  // Build the object to write. Start from live (keeps groupRole, metadataList, etc.), replace
  // the owned processors, keep foreign ones after them.
  const base: LivePipelineValue = live
    ? { ...live.value }
    : { ...(compiled as unknown as LivePipelineValue) };
  for (const stage of PIPELINE_STAGES) {
    const keptForeign = live
      ? stageProcessors(live.value, stage).filter((p) => !isOwned(p.id))
      : [];
    const owned = ownedByStage[stage];
    const liveHasStage = live !== null && live.value[stage] !== undefined;
    // Leave a stage untouched (absent) unless there is something to say about it: otherwise a
    // pipeline created before a stage was managed would show a phantom pending change forever.
    if (!CORE_STAGES.has(stage) && !liveHasStage && owned.length === 0)
      continue;
    base[stage] = { processors: [...owned, ...keptForeign] };
  }
  if (!live) {
    base.groupRole = null;
  } else {
    // Keep the tenant's displayName/metadata but make sure we still target our own customId.
    base.customId = compiled.customId;
  }

  const processorChanges: ProcessorChange[] = [];
  for (const p of ownedNew) {
    const existing = liveOwned.get(p.id);
    if (!existing)
      processorChanges.push({
        id: p.id,
        kind: "added",
        fields: diffValues(undefined, p),
      });
    else if (changed.includes(p.id)) {
      processorChanges.push({
        id: p.id,
        kind: "changed",
        fields: diffValues(existing, p),
      });
    }
  }
  for (const id of removed) {
    processorChanges.push({
      id,
      kind: "removed",
      fields: diffValues(liveOwned.get(id), undefined),
    });
  }

  const stageKeys = new Set<string>(PIPELINE_STAGES);
  const otherChanges = live
    ? diffValues(
        Object.fromEntries(
          Object.entries(live.value).filter(([k]) => !stageKeys.has(k)),
        ),
        Object.fromEntries(
          Object.entries(base).filter(([k]) => !stageKeys.has(k)),
        ),
      )
    : [];
  const liveOrder = live
    ? stageProcessors(live.value, "processing").map((p) => p.id)
    : [];
  const newOrder = stageProcessors(base, "processing").map((p) => p.id);
  const orderChanged =
    live !== null &&
    added.length === 0 &&
    removed.length === 0 &&
    liveOrder.join("\n") !== newOrder.join("\n");

  const noChange =
    live !== null &&
    added.length === 0 &&
    changed.length === 0 &&
    removed.length === 0 &&
    canonical(base) === canonical(live.value);

  return {
    mode: live ? "update" : "create",
    added,
    changed,
    removed,
    processorChanges,
    otherChanges,
    orderChanged,
    unchangedCount,
    foreign,
    noChange,
    merged: base,
  };
}

/** Type guard used when reading the settings API: confirms a returned object really is ours. */
export function isOurPipeline(
  value: unknown,
  customId: string,
): value is LivePipelineValue {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { customId?: unknown }).customId === customId
  );
}

export type { Processor };
