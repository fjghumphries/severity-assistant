import React, { useMemo, useState } from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import { Button } from "@dynatrace/strato-components/buttons";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { type DataTableColumnDef } from "@dynatrace/strato-components/tables";

import type {
  ChangeItem,
  ChangeSummary,
  ChangeTone,
} from "../../lib/deploy/describe";
import { StatTile as Tile } from "../../components/StatTile";
import { AppTable } from "../../components/AppTable";

interface ChangeRow {
  area: string;
  name: string;
  detail: string;
  what: string;
}

const AREAS: {
  key: keyof Pick<
    ChangeSummary,
    "defaults" | "exceptions" | "thresholds" | "security"
  >;
  label: string;
}[] = [
  { key: "defaults", label: "System-wide default" },
  { key: "exceptions", label: "Label-based exception" },
  { key: "thresholds", label: "Threshold default" },
  { key: "security", label: "Security context" },
];

const rowsFor = (summary: ChangeSummary, tone: ChangeTone): ChangeRow[] =>
  AREAS.flatMap(({ key, label }) =>
    summary[key]
      .filter((i: ChangeItem) => i.tone === tone)
      .map((i) => ({
        area: label,
        name: i.title,
        detail: i.detail ?? "",
        what: i.changes?.join("; ") ?? "",
      })),
  );

const changeColumns = (tone: ChangeTone): DataTableColumnDef<ChangeRow>[] => [
  { id: "area", header: "Type", accessor: "area" },
  { id: "name", header: "Rule", accessor: "name" },
  {
    id: "detail",
    header: tone === "removed" ? "Was" : "Matches and result",
    accessor: "detail",
  },
  ...(tone === "changed"
    ? [{ id: "what", header: "What changed", accessor: "what" }]
    : []),
];

type Open = ChangeTone | null;

interface Props {
  summary: ChangeSummary;
}

/** Dashboard row: counts of what a deploy adds / changes / removes plus the 2-hour event impact,
 * each drilling into a side sheet with the detail table. */
export const KpiTiles = ({ summary }: Props) => {
  const [open, setOpen] = useState<Open>(null);
  const added = useMemo(() => rowsFor(summary, "added"), [summary]);
  const changed = useMemo(() => rowsFor(summary, "changed"), [summary]);
  const removed = useMemo(() => rowsFor(summary, "removed"), [summary]);
  const byTone = { added, changed, removed } as const;
  const TITLES = {
    added: "Added rules",
    changed: "Changed rules",
    removed: "Removed rules",
  } as const;

  const sheetTitle = open ? TITLES[open] : "";

  // Three zeros say nothing the deploy panel's "nothing to deploy" does not already say, and were
  // the loudest thing on the screen. Only show the strip when there is a change to look at.
  if (added.length + changed.length + removed.length === 0) return null;

  return (
    <Flex flexDirection="column" gap={8}>
      <Flex gap={12} flexWrap="wrap">
        <Tile
          label="Added"
          value={added.length}
          tone="good"
          onClick={() => setOpen("added")}
        />
        <Tile
          label="Changed"
          value={changed.length}
          tone="warn"
          onClick={() => setOpen("changed")}
        />
        <Tile
          label="Removed"
          value={removed.length}
          tone="bad"
          onClick={() => setOpen("removed")}
        />
      </Flex>

      <Sheet
        title={sheetTitle}
        show={open !== null}
        onDismiss={() => setOpen(null)}
        actions={
          <Button variant="emphasized" onClick={() => setOpen(null)}>
            Close
          </Button>
        }
      >
        <Flex flexDirection="column" gap={16}>
          {(open === "added" || open === "changed" || open === "removed") && (
            <AppTable
              data={byTone[open]}
              columns={changeColumns(open)}
              sortable
              fullWidth
            />
          )}
        </Flex>
      </Sheet>
    </Flex>
  );
};
