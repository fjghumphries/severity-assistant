import React, { useMemo } from "react";
import {
  DataTable,
  type DataTableColumnDef,
  type DataTableProps,
  type DataTableRowData,
} from "@dynatrace/strato-components/tables";

import { TABLE_VARIANT } from "./tableStyle";

/**
 * Strato pads its own cells (12px 16px at comfortable density), but a custom `cell` renderer
 * replaces the whole cell, padding included. So a custom cell sat flush against the left edge, out
 * of line with its own header, and lost its vertical padding too -- which is what made rows look
 * tight. This puts the same padding back around every custom cell.
 */
const Padded = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "12px 16px" }}>{children}</div>
);

type CustomCell = (args: never) => React.ReactNode;

/**
 * Columns with no width are measured once from their first render and then stay that size, so a
 * table did not grow or shrink when the window was resized until the page was remounted. A `1fr`
 * default makes them share the container width and follow it. Group columns and columns that set
 * their own width are left alone.
 */
function prepareColumns<T extends DataTableRowData>(
  columns: DataTableColumnDef<T>[],
): DataTableColumnDef<T>[] {
  return columns.map((col) => {
    const c = col as { cell?: unknown; width?: unknown; columns?: unknown };
    const sized =
      c.width === undefined && c.columns === undefined
        ? ({ ...col, width: "1fr" } as DataTableColumnDef<T>)
        : col;
    if (typeof c.cell !== "function") return sized;
    const render = c.cell as CustomCell;
    return {
      ...sized,
      cell: (args: never) => <Padded>{render(args)}</Padded>,
    } as DataTableColumnDef<T>;
  });
}

/**
 * The app's table: Strato's DataTable with the shared comfortable, centre-aligned look and custom
 * cells padded like the built-in ones. Takes exactly DataTable's props, so column definitions keep
 * their contextual typing, and exposes the same sub-components (e.g. `AppTable.ExpandableRow`).
 */
function AppTableImpl<T extends DataTableRowData>(props: DataTableProps<T>) {
  // DataTable needs a stable columns array, so this follows the caller's memoized one.
  const columns = useMemo(() => prepareColumns(props.columns), [props.columns]);
  return (
    <DataTable
      {...props}
      variant={props.variant ?? TABLE_VARIANT}
      columns={columns}
    />
  );
}

export const AppTable = Object.assign(AppTableImpl, {
  ExpandableRow: DataTable.ExpandableRow,
  ExpandableRowWrapper: DataTable.ExpandableRowWrapper,
});
