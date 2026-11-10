/**
 * Pure derivations over the monitoring rows. No SDK imports: everything the Results screen shows
 * is computed here from one query result so it can be unit-tested without a tenant.
 */

import type { DiscoveryRow } from "../types/discovery";
import type { MonitorRow } from "./query";

/** DQL returns `count()` as a long, which can arrive as a string ("5"). `+=` on strings concatenates
 * silently and the charts then take their categorical-scale path and throw, so coerce once at load. */
export function normalizeRows(rows: MonitorRow[]): MonitorRow[] {
  return rows.map((r) => ({ ...r, c: Number(r.c) }));
}

const PIPELINE_PREFIX = /^davis\.events:/;

/** The pipeline's own id with the pipeline-type prefix stripped, e.g. `pipeline_severity_assistant_v1`. */
export const pipelineKey = (row: Pick<MonitorRow, "pipeline">): string =>
  (row.pipeline ?? "").replace(PIPELINE_PREFIX, "");

/** A readable name: the profile's name for the app's own pipelines, otherwise what Dynatrace calls it. */
export function pipelineDisplayName(
  key: string,
  names: ReadonlyMap<string, string>,
): string {
  if (key === "") return "(no pipeline recorded)";
  return names.get(key) ?? (key === "default" ? "Built-in default" : key);
}

/** Adds `pipelineLabel` to every row so charts and tables can name and colour by pipeline. */
export function withPipelineLabels(
  rows: MonitorRow[],
  names: ReadonlyMap<string, string>,
): MonitorRow[] {
  return rows.map((r) => ({
    ...r,
    pipelineLabel: pipelineDisplayName(pipelineKey(r), names),
  }));
}

/** Only the events one pipeline processed. */
export function onlyPipeline(
  rows: MonitorRow[],
  customId: string,
): MonitorRow[] {
  return rows.filter((r) => pipelineKey(r) === customId);
}

export type EventClass = "modified" | "unchanged" | "unprocessed";

/** An event is "processed" when the app's pipeline wrote its marker; "modified" when that changed
 * the severity it arrived with. */
export function classify(row: MonitorRow): EventClass {
  if (row["sa.source"] === null || row["sa.source"] === undefined)
    return "unprocessed";
  // In observe mode the pipeline records what it would set and leaves event.severity alone, so
  // "modified" then means "would be modified".
  return (row["sa.original_severity"] ?? null) !== effectiveSeverity(row)
    ? "modified"
    : "unchanged";
}

/** The severity the app decided: the observed proposal when there is one, else what is stored. */
export const effectiveSeverity = (row: MonitorRow): string | null =>
  row["sa.proposed_severity"] ?? row["event.severity"] ?? null;

/** True for events a pipeline in observe mode only recorded a proposal for. */
export const isObserved = (row: MonitorRow): boolean =>
  row["sa.proposed_severity"] !== null &&
  row["sa.proposed_severity"] !== undefined;

export interface Totals {
  total: number;
  processed: number;
  modified: number;
  unmatched: number;
  /** Events a pipeline in observe mode only proposed a severity for (not yet applied). */
  observed: number;
}

export function totals(rows: MonitorRow[]): Totals {
  const t: Totals = {
    total: 0,
    processed: 0,
    modified: 0,
    unmatched: 0,
    observed: 0,
  };
  for (const r of rows) {
    t.total += r.c;
    const cls = classify(r);
    if (cls !== "unprocessed") t.processed += r.c;
    if (cls === "modified") t.modified += r.c;
    if (r["sa.source"] === "unmatched") t.unmatched += r.c;
    if (isObserved(r)) t.observed += r.c;
  }
  return t;
}

export type Dimension =
  | "pipeline"
  | "bu"
  | "app"
  | "tier"
  | "stage"
  | "detector"
  | "event.category"
  | "event.name"
  | "severity";

export const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: "bu", label: "Business Unit" },
  { value: "app", label: "Application" },
  { value: "tier", label: "Tier" },
  { value: "stage", label: "Stage" },
  { value: "detector", label: "Anomaly detector" },
  { value: "event.category", label: "Event category" },
  { value: "event.name", label: "Event name" },
  { value: "severity", label: "Severity" },
  { value: "pipeline", label: "Pipeline" },
];

export const NOT_SET = "(not set)";

export function dimensionValue(
  row: MonitorRow,
  dim: Dimension,
  detectorName: (id: string) => string,
): string {
  switch (dim) {
    case "detector":
      return row.detector ? detectorName(row.detector) : "(not detector-based)";
    case "pipeline":
      return row.pipelineLabel ?? (pipelineKey(row) || NOT_SET);
    case "severity":
      return effectiveSeverity(row)
        ? `Severity ${effectiveSeverity(row)}`
        : "(no severity)";
    default:
      return row[dim] ?? NOT_SET;
  }
}

/** The default way to divide a bar: by what the app did to the event. */
export const OUTCOME_LABEL: Record<EventClass, string> = {
  modified: "Modified by the app",
  unchanged: "Processed, unchanged",
  unprocessed: "Not processed",
};

export interface SplitEntry {
  /** Counts per segment of the bar -- by outcome unless a different `segmentOf` was given. */
  segments: Record<string, number>;
  category: string;
  modified: number;
  unchanged: number;
  unprocessed: number;
  total: number;
}

/** Event counts split by one dimension, each bar divided by what the app did, top `limit` by volume. */
export function splitBy(
  rows: MonitorRow[],
  dim: Dimension,
  detectorName: (id: string) => string,
  limit = 12,
  /** What divides each bar. Defaults to what the app did to the event; pass a pipeline label to
   * colour by pipeline instead. */
  segmentOf: (r: MonitorRow) => string = (r) => OUTCOME_LABEL[classify(r)],
): SplitEntry[] {
  const map = new Map<string, SplitEntry>();
  for (const r of rows) {
    const key = dimensionValue(r, dim, detectorName);
    const e = map.get(key) ?? {
      category: key,
      segments: {},
      modified: 0,
      unchanged: 0,
      unprocessed: 0,
      total: 0,
    };
    const seg = segmentOf(r);
    e.segments[seg] = (e.segments[seg] ?? 0) + r.c;
    e[classify(r)] += r.c;
    e.total += r.c;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

export type SeriesPoint = { start: Date; end: Date; value: number };

/** A type alias (not an interface) so it is assignable to the chart library's Timeseries. */
export type Series = { name: string; datapoints: SeriesPoint[] };

/** Counts per time bucket for each series, with empty buckets filled with 0 so lines do not skip. */
export function timeSeriesBy(
  rows: MonitorRow[],
  bucketMs: number,
  seriesOf: (r: MonitorRow) => string,
): Series[] {
  if (rows.length === 0) return [];
  const starts = [...new Set(rows.map((r) => new Date(r.t).getTime()))].sort(
    (a, b) => a - b,
  );
  const first = starts[0];
  const last = starts[starts.length - 1];
  const byName = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const name = seriesOf(r);
    const m = byName.get(name) ?? new Map<number, number>();
    const k = new Date(r.t).getTime();
    m.set(k, (m.get(k) ?? 0) + r.c);
    byName.set(name, m);
  }
  return [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, m]) => {
      const datapoints: SeriesPoint[] = [];
      for (let t = first; t <= last; t += bucketMs) {
        datapoints.push({
          start: new Date(t),
          end: new Date(t + bucketMs),
          value: m.get(t) ?? 0,
        });
      }
      return { name, datapoints };
    });
}

export interface DetectorRow {
  detector: string;
  events: number;
  processed: number;
  modified: number;
  unmatched: number;
}

export function byDetector(
  rows: MonitorRow[],
  detectorName: (id: string) => string,
): DetectorRow[] {
  const map = new Map<string, DetectorRow>();
  for (const r of rows) {
    const key = r.detector ? detectorName(r.detector) : "(not detector-based)";
    const e = map.get(key) ?? {
      detector: key,
      events: 0,
      processed: 0,
      modified: 0,
      unmatched: 0,
    };
    e.events += r.c;
    const cls = classify(r);
    if (cls !== "unprocessed") e.processed += r.c;
    if (cls === "modified") e.modified += r.c;
    if (r["sa.source"] === "unmatched") e.unmatched += r.c;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.events - a.events);
}

export interface TransitionRow {
  /** Raw `event.severity` values, null when the event had none -- the UI decides how to show them. */
  from: string | null;
  to: string | null;
  events: number;
}

/** Severity as it arrived -> severity after the app, for events the app modified. */
export function transitions(rows: MonitorRow[]): TransitionRow[] {
  const map = new Map<string, TransitionRow>();
  for (const r of rows) {
    if (classify(r) !== "modified") continue;
    const from = r["sa.original_severity"] ?? null;
    const to = effectiveSeverity(r);
    const k = `${from}>${to}`;
    const e = map.get(k) ?? { from, to, events: 0 };
    e.events += r.c;
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => b.events - a.events);
}

export interface NameRow {
  eventName: string;
  events: number;
}

/** Event names by volume, optionally only those the pipeline left unmatched. */
export function eventNames(
  rows: MonitorRow[],
  onlyUnmatched = false,
): NameRow[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (onlyUnmatched && r["sa.source"] !== "unmatched") continue;
    map.set(r["event.name"], (map.get(r["event.name"]) ?? 0) + r.c);
  }
  return [...map.entries()]
    .map(([eventName, events]) => ({ eventName, events }))
    .sort((a, b) => b.events - a.events);
}

export interface SourceRow {
  source: string;
  events: number;
}

export function bySource(rows: MonitorRow[]): SourceRow[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = r["sa.source"] ?? "not processed by the app";
    map.set(k, (map.get(k) ?? 0) + r.c);
  }
  return [...map.entries()]
    .map(([source, events]) => ({ source, events }))
    .sort((a, b) => b.events - a.events);
}

/** Collapses to the discovery shape so the existing simulator can answer "what would the current
 * rules do to these events". The severity is the one the event arrived with, so an already-processed
 * event is simulated from its original value, not from the app's own output. */
export function toDiscoveryRows(rows: MonitorRow[]): DiscoveryRow[] {
  const map = new Map<string, DiscoveryRow>();
  for (const r of rows) {
    const severity = r["sa.source"]
      ? (r["sa.original_severity"] ?? null)
      : (r["event.severity"] ?? null);
    const k = [r["event.name"], r.bu, r.app, r.tier, r.stage, severity].join(
      "\u0001",
    );
    const e = map.get(k);
    if (e) e.c += r.c;
    else {
      map.set(k, {
        "event.name": r["event.name"],
        bu: r.bu,
        app: r.app,
        tier: r.tier,
        stage: r.stage,
        "event.severity": severity,
        c: r.c,
      });
    }
  }
  return [...map.values()];
}

/** Dimensions offered as filter dropdowns on the Results screen. */
export const FILTER_DIMENSIONS: Dimension[] = [
  "bu",
  "app",
  "tier",
  "stage",
  "detector",
  "event.category",
];

export type Filters = Partial<Record<Dimension, string[]>>;

/** Distinct labels for one dimension with their event counts, most frequent first. */
export function filterOptions(
  rows: MonitorRow[],
  dim: Dimension,
  detectorName: (id: string) => string,
): { value: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = dimensionValue(r, dim, detectorName);
    map.set(k, (map.get(k) ?? 0) + r.c);
  }
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/** Keeps rows matching every active filter (a dimension with no selection does not filter). */
export function filterRows(
  rows: MonitorRow[],
  filters: Filters,
  detectorName: (id: string) => string,
): MonitorRow[] {
  const active = (Object.entries(filters) as [Dimension, string[]][]).filter(
    ([, v]) => v.length > 0,
  );
  if (active.length === 0) return rows;
  return rows.filter((r) =>
    active.every(([dim, values]) =>
      values.includes(dimensionValue(r, dim, detectorName)),
    ),
  );
}

/** The dimension list with the four role labels taken from Settings instead of the defaults. */
export function dimensionsWithLabels(
  labels: Partial<Record<Dimension, string>>,
): { value: Dimension; label: string }[] {
  return DIMENSIONS.map((d) => ({
    value: d.value,
    label: labels[d.value] ?? d.label,
  }));
}
