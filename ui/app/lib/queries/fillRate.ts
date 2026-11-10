/**
 * Fill rate for any mapped field: the share of recent Davis events where it carries a value.
 * Settings used to know four fields (`KNOWN_FIELD_TO_COLUMN`); this probes whatever the user
 * mapped, with one small query. Pure: the query text and the reading of its row are testable
 * without a tenant.
 *
 * Field names go into DQL text, so only plain dotted identifiers are accepted; anything else is
 * reported as unavailable instead of being quoted into a query.
 */

import type { DiscoveryWindow } from "../types/discovery";

const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

export const isProbeableField = (field: string): boolean =>
  FIELD_RE.test(field.trim());

/** The distinct probeable fields, in first-seen order, trimmed. */
export function probeFields(fields: string[]): string[] {
  const out: string[] = [];
  for (const f of fields.map((x) => x.trim())) {
    if (isProbeableField(f) && !out.includes(f)) out.push(f);
  }
  return out;
}

/**
 * Tag fields arrive as a string or a one-element array, so the same normalisation the discovery
 * query uses applies here (see `discovery.ts`): take the first element, else the string.
 */
export function buildFillRateQuery(
  fields: string[],
  window: DiscoveryWindow = "2h",
): string | null {
  const probed = probeFields(fields);
  if (probed.length === 0) return null;
  const counts = probed
    .map(
      (f, i) =>
        `f${i} = countIf(isNotNull(coalesce(arrayFirst(${f}), toString(${f}))))`,
    )
    .join(", ");
  return `fetch dt.davis.events, from:-${window}
| summarize total = count(), ${counts}`;
}

/** Fill rate (0..1) per probed field, from the single result row. */
export function readFillRates(
  fields: string[],
  row: Record<string, unknown> | undefined,
): Record<string, number> {
  const probed = probeFields(fields);
  const out: Record<string, number> = {};
  if (!row) return out;
  const total = Number(row.total ?? 0);
  probed.forEach((f, i) => {
    const n = Number(row[`f${i}`] ?? 0);
    out[f] = total > 0 ? n / total : 0;
  });
  return out;
}
