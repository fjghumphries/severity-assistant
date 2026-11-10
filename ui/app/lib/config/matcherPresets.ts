/**
 * The route matcher decides which Davis events a profile takes. `true` takes every event, so other
 * routes (including other teams' pipelines) stop receiving them; that is never the default. A new
 * install starts with a matcher that takes only events that opt in, and "all events" is a deliberate,
 * confirmed choice.
 */

/** Takes only events carrying `sa.optin = "true"`: nothing, until something upstream marks events.
 * Checked against the tenant's processor preview: matches an event with the field, not without. */
export const SAFE_DEFAULT_MATCHER = 'matchesValue(sa.optin, "true")';

export type MatcherPreset = "custom" | "all";

export const isAllEvents = (matcher: string): boolean =>
  matcher.trim() === "true";

export const matcherPresetOf = (matcher: string): MatcherPreset =>
  isAllEvents(matcher) ? "all" : "custom";
