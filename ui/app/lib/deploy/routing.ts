/**
 * Route planning (D6a/D6b/D11): the app owns exactly ONE routing entry, the one whose
 * `pipelineId` is the app pipeline's settings objectId. Routing is first-match-wins and
 * order-dependent, so the entry goes at the TOP; every other entry is left byte-for-byte alone
 * (the old pipeline's route is not edited, it simply sits below ours as a rollback path).
 *
 * Pure, no SDK imports. Reading/writing the routing settings object is in `pipelineApi.ts`.
 */

export interface RoutingEntry {
  description: string;
  enabled: boolean;
  matcher: string;
  pipelineId: string;
  pipelineType: string;
  [key: string]: unknown;
}

export const ROUTE_DESCRIPTION = "Severity Assistant (managed by the app)";

/** Every route the app writes starts with this, which is how managed routes are recognised. */
export const MANAGED_ROUTE_PREFIX = "Severity Assistant";

export type RouteAction = "enable" | "disable";

export interface RoutePlan {
  action: RouteAction;
  entries: RoutingEntry[];
  /** Nothing would change. */
  noChange: boolean;
  /** Enabled entries that ours will sit above: events they used to receive may now be taken by
   * ours instead (only the ones ours matches -- all of them if the matcher is "true"). */
  shadowing: RoutingEntry[];
  /** Enabled entries above ours that would swallow its events (silent failure, docs/11). */
  shadowedBy: RoutingEntry[];
  warnings: string[];
}

const isCatchAll = (matcher: string) => matcher.trim().toLowerCase() === "true";

export function planRoute(
  current: RoutingEntry[],
  pipelineObjectId: string,
  matcher: string,
  action: RouteAction,
  description: string = ROUTE_DESCRIPTION,
): RoutePlan {
  const ours = current.find((e) => e.pipelineId === pipelineObjectId);
  const others = current.filter((e) => e.pipelineId !== pipelineObjectId);
  const warnings: string[] = [];

  const desired: RoutingEntry = {
    ...(ours ?? {}),
    description,
    enabled: action === "enable",
    matcher,
    pipelineId: pipelineObjectId,
    pipelineType: "custom",
  };

  const entries = [desired, ...others];
  const same = JSON.stringify(entries) === JSON.stringify(current);

  const shadowing = action === "enable" ? others.filter((e) => e.enabled) : [];
  if (action === "enable" && isCatchAll(matcher) && shadowing.length > 0) {
    warnings.push(
      `Our catch-all route will take every Davis event; ${shadowing.length} enabled route(s) below it will stop receiving anything.`,
    );
  }
  const otherManaged = others.filter((e) => e.enabled && e.description.startsWith(MANAGED_ROUTE_PREFIX));
  if (action === "enable" && otherManaged.length > 0) {
    warnings.push(
      `${otherManaged.length} other Severity Assistant route(s) are enabled below this one. Routing is first-match-wins, so they only receive events this matcher does not match.`,
    );
  }
  if (action === "enable" && matcher.trim() === "") {
    warnings.push("Route matcher is empty.");
  }
  if (ours && ours.matcher !== matcher) {
    warnings.push(`Existing app route matcher "${ours.matcher}" will be replaced by "${matcher}".`);
  }

  return {
    action,
    entries,
    noChange: same,
    shadowing,
    // We always place ours first, so nothing can sit above it after the write.
    shadowedBy: [],
    warnings,
  };
}

/** Uninstall: drop the app's routing entry and leave every other entry untouched. */
export function planRemoveRoute(
  current: RoutingEntry[],
  pipelineObjectId: string,
): { entries: RoutingEntry[]; hadRoute: boolean } {
  const entries = current.filter((e) => e.pipelineId !== pipelineObjectId);
  return { entries, hadRoute: entries.length !== current.length };
}

/** Diagnostic for the CURRENT state (before any write): is our entry live and reachable? */
export function describeRouteState(
  current: RoutingEntry[],
  pipelineObjectId: string,
): { state: "absent" | "disabled" | "shadowed" | "live"; shadowedBy: RoutingEntry[] } {
  const idx = current.findIndex((e) => e.pipelineId === pipelineObjectId);
  if (idx === -1) return { state: "absent", shadowedBy: [] };
  const ours = current[idx];
  if (!ours.enabled) return { state: "disabled", shadowedBy: [] };
  const above = current.slice(0, idx).filter((e) => e.enabled && isCatchAll(e.matcher));
  if (above.length > 0) return { state: "shadowed", shadowedBy: above };
  return { state: "live", shadowedBy: [] };
}
