/**
 * Applied to every DataTable. Strato's defaults are `rowDensity: default` and `verticalAlignment:
 * top`, which packs rows tightly and lets cells of different heights (text, chip, button) sit at
 * different levels -- the "cramped and misaligned" look. Comfortable rows with a shared centre line
 * fix both.
 */
export const TABLE_VARIANT = {
  rowDensity: "comfortable",
  verticalAlignment: "center",
  rowSeparation: "horizontalDividers",
} as const;
