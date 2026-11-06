import type { RoleRegistry } from "../types/registry";
import type { DiscoveryWindow } from "../types/discovery";

/** The four fixed columns of a row, each backed by one of the app's four semantic roles. */
export type Slot = "bu" | "app" | "tier" | "stage";

export const SLOT_ROLE: Record<Slot, string> = {
  bu: "business_unit",
  app: "application",
  tier: "tier",
  stage: "stage",
};

export type SlotFields = Record<Slot, string>;

export const DEFAULT_SLOT_FIELDS: SlotFields = {
  bu: "primary_tags.bu",
  app: "primary_tags.landscape",
  tier: "primary_tags.tier",
  stage: "primary_tags.stage",
};

/** Only plain dotted field paths are interpolated into DQL. */
const SAFE_FIELD = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_-]+)*$/;

/** The tenant field behind each slot, from the Settings role registry (so a remap is followed). */
export function slotFields(
  registry: RoleRegistry | null | undefined,
): SlotFields {
  const out = { ...DEFAULT_SLOT_FIELDS };
  for (const slot of Object.keys(SLOT_ROLE) as Slot[]) {
    const field = registry?.roles.find(
      (r) => r.role === SLOT_ROLE[slot],
    )?.field;
    if (field && SAFE_FIELD.test(field)) out[slot] = field;
  }
  return out;
}

/** Display label per slot from the registry (so a rename in Settings is followed). */
export function slotLabels(
  registry: RoleRegistry | null | undefined,
): Record<Slot, string> {
  const fallback: Record<Slot, string> = {
    bu: "Business Unit",
    app: "Application",
    tier: "Tier",
    stage: "Stage",
  };
  for (const slot of Object.keys(SLOT_ROLE) as Slot[]) {
    const label = registry?.roles.find(
      (r) => r.role === SLOT_ROLE[slot],
    )?.label;
    if (label) fallback[slot] = label;
  }
  return fallback;
}

/** One row of the monitoring query: a (time bucket x dimensions) combination and its count. */
export interface MonitorRow {
  /** Start of the time bucket (ISO timestamp). */
  t: string;
  /** `dt.settings.object_id` of the anomaly detector, null for non-detector events. */
  detector: string | null;
  "event.name": string;
  "event.category": string | null;
  bu: string | null;
  app: string | null;
  tier: string | null;
  stage: string | null;
  /** The pipeline that processed the event: `dt.openpipeline.pipelines`, e.g.
   * `davis.events:pipeline_severity_assistant_v1`. */
  pipeline: string | null;
  /** Set client-side from `pipeline`: a readable name (a profile's name, "Built-in default"...). */
  pipelineLabel?: string;
  /** Severity as stored now (after the pipeline, if it ran). */
  "event.severity": string | null;
  /** Written by the app's pipeline: "exception" | "default" | "unmatched". Absent = not processed. */
  "sa.source": string | null;
  /** Severity the event arrived with, written by the app's pipeline before it overwrote it. */
  "sa.original_severity": string | null;
  c: number;
}

/** Bucket width per window: ~12-28 points per chart. */
export const BUCKET: Record<DiscoveryWindow, { query: string; ms: number }> = {
  "2h": { query: "10m", ms: 10 * 60_000 },
  "24h": { query: "1h", ms: 60 * 60_000 },
  "7d": { query: "6h", ms: 6 * 60 * 60_000 },
};

export const MONITOR_ROW_LIMIT = 50000;

/**
 * The single query behind the Results screen. Same cost model as the discovery query
 * (docs/10-phase0-results.md): bytes scanned are driven by the window, not by filters or
 * grouping, so everything -- tiles, charts, splits, simulation input -- derives from this one
 * result client-side. The `arrayFirst(...)` role normalisation is the same mandatory one used by
 * the discovery query. `sa.*` are null until the pipeline has processed events.
 */
export function buildMonitorQuery(
  window: DiscoveryWindow,
  f: SlotFields = DEFAULT_SLOT_FIELDS,
): string {
  return `fetch dt.davis.events, from:-${window}
| fieldsAdd bu    = coalesce(arrayFirst(${f.bu}), toString(${f.bu})),
            app   = coalesce(arrayFirst(${f.app}), toString(${f.app})),
            tier  = coalesce(arrayFirst(${f.tier}), toString(${f.tier})),
            stage = coalesce(arrayFirst(${f.stage}), toString(${f.stage})),
            pipeline = coalesce(arrayFirst(dt.openpipeline.pipelines), toString(dt.openpipeline.pipelines))
| summarize c = count(), by:{t = bin(timestamp, ${BUCKET[window].query}), detector = dt.settings.object_id, pipeline, event.name, event.category, bu, app, tier, stage, event.severity, sa.source, sa.original_severity}
| limit ${MONITOR_ROW_LIMIT}`;
}
