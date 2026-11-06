import type { DiscoveryWindow } from "../types/discovery";

/**
 * The one combined discovery query the whole app is built around.
 *
 * Query cost in Dynatrace is driven by bytes scanned, and `dt.davis.events` is a fetch
 * view that rejects both `bucket:` and `samplingRatio:` (measured in docs/10-phase0-results.md).
 * The only lever is the time window, and filters do not reduce scanned bytes -- every 2h
 * query scans ~18.8 MB regardless of what it filters on. So instead of issuing a query per
 * picker, per keystroke, or per rule, this single query returns every
 * (event.name x role values x severity) combination seen in the window, and the rest of the
 * app (event picker, role value pickers, live match preview, coverage view, severity
 * distribution) is derived from this one cached result set client-side.
 *
 * The `arrayFirst(x), toString(x)` normalization on each role field is mandatory, not
 * stylistic: Phase 0 found the same tag field arriving as either a plain string ("bu1") or a
 * single-element array (["bu1"]), and `toString(array("bu1"))` returns the literal string
 * `["bu1"]` -- brackets and quotes included. Without this normalization the UI would offer
 * `["bu1"]` as a distinct value from `bu1`, and a rule authored against one shape would
 * silently never match events carrying the other. See docs/01-openpipeline-verified-facts.md
 * fact 4c and docs/10-phase0-results.md.
 */
export function buildDiscoveryQuery(window: DiscoveryWindow = "2h"): string {
  return `fetch dt.davis.events, from:-${window}
| fieldsAdd bu    = coalesce(arrayFirst(primary_tags.bu), toString(primary_tags.bu)),
            app   = coalesce(arrayFirst(primary_tags.landscape), toString(primary_tags.landscape)),
            tier  = coalesce(arrayFirst(primary_tags.tier), toString(primary_tags.tier)),
            stage = coalesce(arrayFirst(primary_tags.stage), toString(primary_tags.stage))
| summarize c = count(), by:{event.name, bu, app, tier, stage, event.severity}
| sort c desc
| limit 2000`;
}
