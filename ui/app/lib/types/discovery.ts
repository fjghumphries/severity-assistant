/**
 * One row of the combined discovery query result.
 *
 * See docs/03-config-store-and-rule-model.md Part 4 and docs/10-phase0-results.md:
 * a single query over the 2h window returns every (event.name x role values x severity)
 * combination actually seen in the tenant. Everything else (event picker, value pickers,
 * match preview, coverage, severity distribution) is derived from this one cached result
 * client-side -- no further queries.
 */
export interface DiscoveryRow {
  "event.name": string;
  bu: string | null;
  app: string | null;
  tier: string | null;
  stage: string | null;
  "event.severity": string | null;
  c: number;
}

export const ROLE_COLUMNS = ["bu", "app", "tier", "stage"] as const;
export type RoleColumn = (typeof ROLE_COLUMNS)[number];

export const ROLE_LABELS: Record<RoleColumn, string> = {
  bu: "Business Unit",
  app: "Application",
  tier: "Tier",
  stage: "Stage",
};

/** Discovery query timeframe options, per docs/10-phase0-results.md query cost rules. */
export type DiscoveryWindow = "2h" | "24h" | "7d";

export const DISCOVERY_WINDOWS: { value: DiscoveryWindow; label: string }[] = [
  { value: "2h", label: "Last 2 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
];
