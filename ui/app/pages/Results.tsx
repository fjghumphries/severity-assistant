import React, { useMemo, useState } from "react";

import { useDql } from "@dynatrace-sdk/react-hooks";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Strong, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Select } from "@dynatrace/strato-components/forms";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import {
  CategoricalBarChart,
  TimeseriesChart,
} from "@dynatrace/strato-components/charts";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { CriticalIcon } from "@dynatrace/strato-icons";

import { SeverityBadge, severityText } from "../components/SeverityBadge";
import { StatTile } from "../components/StatTile";
import {
  useEffectiveRegistry,
  useSharedRegistry,
} from "../lib/config/ProfileContext";
import { useRegistry } from "../lib/config/useRegistry";
import { useRules } from "../lib/config/useRules";
import {
  bySource,
  byDetector,
  classify,
  DetectorRow,
  dimensionsWithLabels,
  Dimension,
  eventNames,
  FILTER_DIMENSIONS,
  filterOptions,
  filterRows,
  Filters,
  normalizeRows,
  splitBy,
  timeSeriesBy,
  toDiscoveryRows,
  totals,
  transitions,
  onlyPipeline,
  withPipelineLabels,
} from "../lib/monitor/derive";
import {
  BUCKET,
  buildMonitorQuery,
  MONITOR_ROW_LIMIT,
  MonitorRow,
  slotFields,
  slotLabels,
} from "../lib/monitor/query";
import { useDetectorLabels } from "../lib/queries/useDetectorLabels";
import { PageHeader } from "../components/PageHeader";
import { simulate } from "../lib/simulate/simulate";
import { DISCOVERY_WINDOWS, DiscoveryWindow } from "../lib/types/discovery";
import { AppTable } from "../components/AppTable";

type Open =
  "total" | "processed" | "modified" | "unmatched" | "simulated" | null;

const SHEET_TITLES: Record<Exclude<Open, null>, string> = {
  total: "Event names by volume",
  processed: "What decided the severity",
  modified: "Severity changes made by the app",
  unmatched: "Event names no rule matched",
  simulated: "What the current rules would change",
};

const detectorColumns: DataTableColumnDef<DetectorRow>[] = [
  { id: "detector", header: "Anomaly detector", accessor: "detector" },
  {
    id: "events",
    header: "Events",
    accessor: "events",
    columnType: "meterbar",
    config: { max: "data-max" },
  },
  { id: "processed", header: "Processed", accessor: "processed" },
  { id: "modified", header: "Modified", accessor: "modified" },
  { id: "unmatched", header: "No rule matched", accessor: "unmatched" },
];

const SEVERITY_SERIES = (r: MonitorRow) => severityText(r["event.severity"]);
const CLASS_SERIES = (r: MonitorRow) =>
  ({
    modified: "Modified by the app",
    unchanged: "Processed, unchanged",
    unprocessed: "Not processed",
  })[classify(r)];

/**
 * Events: monitoring of the Davis events themselves -- how many, when, for which detector and
 * business fields, and what the app's pipeline did to them. The Pipeline tab is configuration;
 * this is where its effect is observed. One query, everything else is derived client-side.
 */
export const Results = () => {
  const [window, setWindow] = useState<DiscoveryWindow>("24h");
  const [dim, setDim] = useState<Dimension>("bu");
  const [open, setOpen] = useState<Open>(null);
  const [filters, setFilters] = useState<Filters>({});
  // "profile": only events this profile's pipeline processed. "all": every Davis event, so the
  // pipelines can be told apart.
  const [scope, setScope] = useState<"profile" | "all">("profile");
  const [colourBy, setColourBy] = useState<"outcome" | "pipeline">("outcome");

  const { registry, isLoading: registryLoading } = useRegistry();
  const dims = useMemo(
    () => dimensionsWithLabels(slotLabels(registry)),
    [registry],
  );
  const query = buildMonitorQuery(window, slotFields(registry));
  const {
    data,
    error,
    isLoading: queryLoading,
    isError,
    refetch,
  } = useDql<MonitorRow>(query, { enabled: !registryLoading });
  const loading = queryLoading || registryLoading;
  const { registry: sharedRegistry } = useSharedRegistry();
  const { registry: profileRegistry } = useEffectiveRegistry();
  const pipelineNames = useMemo(() => {
    const names = new Map<string, string>();
    if (sharedRegistry) {
      names.set(sharedRegistry.pipelineCustomId, "Default");
      for (const p of sharedRegistry.profiles ?? [])
        names.set(p.pipelineCustomId, p.name);
    }
    return names;
  }, [sharedRegistry]);
  const everyRow = useMemo(
    () => withPipelineLabels(normalizeRows(data?.records ?? []), pipelineNames),
    [data, pipelineNames],
  );
  const profilePipeline = profileRegistry?.pipelineCustomId ?? "";
  const allRows = useMemo(
    () =>
      scope === "profile" ? onlyPipeline(everyRow, profilePipeline) : everyRow,
    [everyRow, scope, profilePipeline],
  );
  const scannedGb = data?.metadata?.grail?.scannedBytes
    ? (data.metadata.grail.scannedBytes / 1e9).toFixed(1)
    : undefined;

  const detectorIds = useMemo(
    () => [
      ...new Set(allRows.flatMap((r) => (r.detector ? [r.detector] : []))),
    ],
    [allRows],
  );
  const detectorName = useDetectorLabels(detectorIds);
  const { rules } = useRules();

  const rows = useMemo(
    () => filterRows(allRows, filters, detectorName),
    [allRows, filters, detectorName],
  );
  const filterOpts = useMemo(
    () =>
      FILTER_DIMENSIONS.map((d) => ({
        dim: d,
        label: dims.find((x) => x.value === d)?.label ?? d,
        options: filterOptions(allRows, d, detectorName),
      })),
    [allRows, detectorName, dims],
  );
  const filtersActive = Object.values(filters).some((v) => v.length > 0);

  const t = useMemo(() => totals(rows), [rows]);
  const bucketMs = BUCKET[window].ms;
  const bySeverity = useMemo(
    () => timeSeriesBy(rows, bucketMs, SEVERITY_SERIES),
    [rows, bucketMs],
  );
  const byClass = useMemo(
    () => timeSeriesBy(rows, bucketMs, CLASS_SERIES),
    [rows, bucketMs],
  );
  const byPipelineSeries = useMemo(
    () =>
      timeSeriesBy(
        rows,
        bucketMs,
        (r) => r.pipelineLabel ?? "(no pipeline recorded)",
      ),
    [rows, bucketMs],
  );
  // Colouring by pipeline only means something when more than one is on screen.
  const colouring = scope === "all" ? colourBy : "outcome";
  const split = useMemo(
    () =>
      splitBy(
        rows,
        dim,
        detectorName,
        12,
        colouring === "pipeline"
          ? (r) => r.pipelineLabel ?? "(no pipeline recorded)"
          : undefined,
      ),
    [rows, dim, detectorName, colouring],
  );
  const detectorRows = useMemo(
    () => byDetector(rows, detectorName),
    [rows, detectorName],
  );
  const sim = useMemo(
    () =>
      registry && rows.length > 0
        ? simulate(toDiscoveryRows(rows), rules, registry)
        : null,
    [rows, rules, registry],
  );

  const dimLabel = dims.find((d) => d.value === dim)?.label ?? "";
  const truncated = allRows.length >= MONITOR_ROW_LIMIT;

  return (
    <Flex flexDirection="column" padding={32} gap={32}>
      <Flex flexDirection="column" gap={8}>
        <PageHeader
          title="Results"
          subtitle={
            <>
              Davis events and what the severity pipeline did to them.
              {scannedGb &&
                ` This view scanned ${scannedGb} GB; a wider window scans proportionally more.`}
            </>
          }
          chips={[
            {
              label:
                t.processed > 0
                  ? `${t.modified} modified`
                  : "nothing processed yet",
              tone: t.processed > 0 ? "success" : "neutral",
            },
          ]}
          action={{ label: "Back to Pipeline", to: "/pipeline" }}
        />
        <Flex justifyContent="flex-end">
          <Flex alignItems="center" gap={8}>
            <Select value={scope} onChange={(v) => v && setScope(v)}>
              <Select.Content>
                <Select.Option value="profile">This profile</Select.Option>
                <Select.Option value="all">All pipelines</Select.Option>
              </Select.Content>
            </Select>
            <Select value={window} onChange={(v) => v && setWindow(v)}>
              <Select.Content>
                {DISCOVERY_WINDOWS.map((w) => (
                  <Select.Option key={w.value} value={w.value}>
                    {w.label}
                  </Select.Option>
                ))}
              </Select.Content>
            </Select>
            <Button
              variant="emphasized"
              disabled={loading}
              onClick={() => void refetch()}
            >
              Refresh
            </Button>
          </Flex>
        </Flex>
      </Flex>

      {isError && (
        <Flex alignItems="center" gap={8}>
          <CriticalIcon />
          <Text>{error?.message ?? "Query failed."}</Text>
          <Button variant="emphasized" onClick={() => void refetch()}>
            Retry
          </Button>
        </Flex>
      )}

      {loading && (
        <Flex alignItems="center" gap={8}>
          <ProgressCircle />
          <Text>Loading events...</Text>
        </Flex>
      )}

      {!loading && !isError && (
        <>
          {scope === "profile" &&
            allRows.length === 0 &&
            everyRow.length > 0 && (
              <Surface padding={24}>
                <Text>
                  <Strong>
                    No event in this window went through this profile&apos;s
                    pipeline.
                  </Strong>{" "}
                  Its route may be off, or its matcher may not match these
                  events. Switch to <Strong>All pipelines</Strong> to see where
                  they went.
                </Text>
              </Surface>
            )}
          {t.processed === 0 &&
            !(
              scope === "profile" &&
              allRows.length === 0 &&
              everyRow.length > 0
            ) && (
              <Surface padding={24}>
                <Text>
                  <Strong>
                    No event in this window has passed through the app&apos;s
                    pipeline yet.
                  </Strong>{" "}
                  Processed and Modified stay at 0 until the route is live.
                  Until then use &quot;Would change&quot; to preview the effect
                  of your rules on these events.
                </Text>
              </Surface>
            )}
          {truncated && (
            <Text>
              The result hit the {MONITOR_ROW_LIMIT.toLocaleString()}-row limit,
              so counts are partial. Use a narrower window.
            </Text>
          )}

          <Flex gap={12} flexWrap="wrap" alignItems="flex-end">
            {filterOpts.map((f) => (
              <Flex
                key={f.dim}
                flexDirection="column"
                gap={4}
                style={{ minWidth: 180 }}
              >
                <Text>{f.label}</Text>
                <Select
                  multiple
                  clearable
                  value={filters[f.dim] ?? []}
                  onChange={(v: string[]) =>
                    setFilters((prev) => ({ ...prev, [f.dim]: v }))
                  }
                >
                  <Select.Content>
                    {f.options.map((o) => (
                      <Select.Option key={o.value} value={o.value}>
                        {o.value} ({o.count})
                      </Select.Option>
                    ))}
                  </Select.Content>
                </Select>
              </Flex>
            ))}
            {filtersActive && (
              <Button variant="emphasized" onClick={() => setFilters({})}>
                Clear filters
              </Button>
            )}
          </Flex>

          <Flex gap={12} flexWrap="wrap">
            <StatTile
              label="Events"
              value={t.total}
              onClick={() => setOpen("total")}
            />
            <StatTile
              label="Processed by the app"
              value={t.processed}
              onClick={() => setOpen("processed")}
            />
            <StatTile
              label="Modified"
              value={t.modified}
              tone={t.modified > 0 ? "warn" : "neutral"}
              onClick={() => setOpen("modified")}
            />
            <StatTile
              label="No rule matched"
              value={t.unmatched}
              tone={t.unmatched > 0 ? "bad" : "neutral"}
              onClick={() => setOpen("unmatched")}
            />
            {sim && (
              <StatTile
                label="Would change (simulated)"
                value={sim.changedEvents}
                onClick={() => setOpen("simulated")}
              />
            )}
          </Flex>

          <Flex gap={16} flexWrap="wrap">
            <Surface padding={24} style={{ flex: 1, minWidth: 420 }}>
              <Flex flexDirection="column" gap={8}>
                <Heading level={4}>Events over time, by severity</Heading>
                <TimeseriesChart
                  data={bySeverity}
                  variant="area"
                  height={260}
                />
              </Flex>
            </Surface>
            <Surface padding={24} style={{ flex: 1, minWidth: 420 }}>
              <Flex flexDirection="column" gap={8}>
                <Heading level={4}>
                  {scope === "all"
                    ? "Events over time, by pipeline"
                    : "Events over time, by what the app did"}
                </Heading>
                <TimeseriesChart
                  data={scope === "all" ? byPipelineSeries : byClass}
                  variant="area"
                  height={260}
                />
              </Flex>
            </Surface>
          </Flex>

          <Surface padding={24}>
            <Flex flexDirection="column" gap={8}>
              <Flex
                justifyContent="space-between"
                alignItems="center"
                flexWrap="wrap"
                gap={8}
              >
                <Heading level={4}>Events split by {dimLabel}</Heading>
                <Flex alignItems="center" gap={8}>
                  {scope === "all" && (
                    <Select
                      value={colourBy}
                      onChange={(v) => v && setColourBy(v)}
                    >
                      <Select.Content>
                        <Select.Option value="outcome">
                          Colour by what the app did
                        </Select.Option>
                        <Select.Option value="pipeline">
                          Colour by pipeline
                        </Select.Option>
                      </Select.Content>
                    </Select>
                  )}
                  <Select value={dim} onChange={(v) => v && setDim(v)}>
                    <Select.Content>
                      {dims.map((d) => (
                        <Select.Option key={d.value} value={d.value}>
                          {d.label}
                        </Select.Option>
                      ))}
                    </Select.Content>
                  </Select>
                </Flex>
              </Flex>
              <CategoricalBarChart
                data={split.map((s) => ({
                  category: s.category,
                  value: s.segments,
                }))}
                // Strato's new XY-based bar renderer (feature flag "categoricalBarToXY") throws
                // "scale.bandwidth is not a function" on stacked bars; the legacy renderer is fine.
                __useXYAdoption={false}
                groupMode="stacked"
                height={320}
              />
            </Flex>
          </Surface>

          <Flex flexDirection="column" gap={8}>
            <Heading level={4}>By anomaly detector</Heading>
            <AppTable
              data={detectorRows}
              columns={detectorColumns}
              sortable
              fullWidth
            />
          </Flex>
        </>
      )}

      <Sheet
        title={open ? SHEET_TITLES[open] : ""}
        show={open !== null}
        onDismiss={() => setOpen(null)}
        actions={
          <Button variant="emphasized" onClick={() => setOpen(null)}>
            Close
          </Button>
        }
      >
        <Flex flexDirection="column" gap={16}>
          {open === "total" && (
            <AppTable
              data={eventNames(rows)}
              columns={[
                {
                  id: "eventName",
                  header: "Event name",
                  accessor: "eventName",
                },
                {
                  id: "events",
                  header: "Events",
                  accessor: "events",
                  columnType: "meterbar",
                  config: { max: "data-max" },
                },
              ]}
              sortable
              fullWidth
            />
          )}
          {open === "processed" && (
            <AppTable
              data={bySource(rows)}
              columns={[
                { id: "source", header: "Decided by", accessor: "source" },
                {
                  id: "events",
                  header: "Events",
                  accessor: "events",
                  columnType: "meterbar",
                  config: { max: "data-max" },
                },
              ]}
              fullWidth
            />
          )}
          {open === "modified" && (
            <AppTable
              data={transitions(rows)}
              columns={[
                {
                  id: "from",
                  header: "Arrived as",
                  accessor: (row) => row.from ?? "",
                  cell: ({ rowData }) => (
                    <SeverityBadge severity={rowData.from} />
                  ),
                },
                {
                  id: "to",
                  header: "Set to",
                  accessor: (row) => row.to ?? "",
                  cell: ({ rowData }) => (
                    <SeverityBadge severity={rowData.to} />
                  ),
                },
                { id: "events", header: "Events", accessor: "events" },
              ]}
              sortable
              fullWidth
            />
          )}
          {open === "unmatched" && (
            <AppTable
              data={eventNames(rows, true)}
              columns={[
                {
                  id: "eventName",
                  header: "Event name",
                  accessor: "eventName",
                },
                { id: "events", header: "Events", accessor: "events" },
              ]}
              sortable
              fullWidth
            />
          )}
          {open === "simulated" && sim && (
            <>
              <Text>
                {sim.changedEvents} of {sim.totalEvents} events would get a
                different severity ({sim.matchedEvents} matched a rule).
                Event-level only: a problem takes the most severe of its events.
              </Text>
              <AppTable
                data={sim.transitions.map((x) => ({
                  from: x.from,
                  to: x.to,
                  events: x.count,
                }))}
                columns={[
                  {
                    id: "from",
                    header: "Today",
                    accessor: (row) => row.from ?? "",
                    cell: ({ rowData }) => (
                      <SeverityBadge severity={rowData.from} />
                    ),
                  },
                  {
                    id: "to",
                    header: "With current rules",
                    accessor: (row) => row.to ?? "",
                    cell: ({ rowData }) => (
                      <SeverityBadge severity={rowData.to} />
                    ),
                  },
                  { id: "events", header: "Events", accessor: "events" },
                ]}
                sortable
                fullWidth
              />
              {sim.skippedRules.length > 0 && (
                <>
                  <Heading level={4}>
                    Rules not simulated ({sim.skippedRules.length})
                  </Heading>
                  <AppTable
                    data={sim.skippedRules}
                    columns={[
                      { id: "name", header: "Rule", accessor: "name" },
                      { id: "reason", header: "Why", accessor: "reason" },
                    ]}
                    fullWidth
                  />
                </>
              )}
            </>
          )}
        </Flex>
      </Sheet>
    </Flex>
  );
};
