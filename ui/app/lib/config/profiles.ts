/**
 * Profiles: several independent app-managed pipelines + routes, each with its own rules, matcher,
 * fallback and security context, sharing the role definitions. Pure -- no SDK or React imports.
 *
 * The "default" profile is the registry's own top-level fields and the original rules key, so a
 * tenant set up before profiles existed needs no migration and behaves exactly as before.
 */

import type { Profile, RoleRegistry } from "../types/registry";

export const DEFAULT_PROFILE_ID = "default";
export const DEFAULT_PROFILE_NAME = "Default";

/** Prefix of every route description the app writes: how its routes are recognised as managed. */
export const MANAGED_PREFIX = "Severity Assistant";

/** Rules of the default profile keep the original key; others are keyed by profile id. */
export const DEFAULT_RULES_KEY = "severity-assistant.rules.v1";

export function rulesKeyFor(profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID
    ? DEFAULT_RULES_KEY
    : `severity-assistant.rules.${profileId}.v1`;
}

export interface ProfileSummary {
  id: string;
  name: string;
  isDefault: boolean;
}

export function listProfiles(
  registry: RoleRegistry | null | undefined,
): ProfileSummary[] {
  const extra = registry?.profiles ?? [];
  return [
    { id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME, isDefault: true },
    ...extra.map((p) => ({ id: p.id, name: p.name, isDefault: false })),
  ];
}

/** The id to use: the requested one when it exists, else the default profile. */
export function resolveProfileId(
  registry: RoleRegistry | null | undefined,
  requested: string | null,
): string {
  return listProfiles(registry).some((p) => p.id === requested)
    ? (requested as string)
    : DEFAULT_PROFILE_ID;
}

/**
 * The registry as one profile sees it: shared roles plus that profile's own pipeline id, matcher,
 * fallback and security context, and the names used for its pipeline and route. The compiler,
 * planner and route code take this unchanged -- they stay profile-agnostic.
 */
export function effectiveRegistry(
  registry: RoleRegistry,
  profileId: string,
): RoleRegistry {
  const p = registry.profiles?.find((x) => x.id === profileId);
  if (!p) return registry;
  return {
    ...registry,
    pipelineCustomId: p.pipelineCustomId,
    routeMatcher: p.routeMatcher,
    defaultSeverity: p.defaultSeverity,
    securityContext: p.securityContext,
    writeMode: p.writeMode,
    pipelineDisplayName: `${MANAGED_PREFIX}: ${p.name} (generated -- do not edit)`,
    routeDescription: `${MANAGED_PREFIX}: ${p.name} (managed by the app)`,
  };
}

/** "Team Alpha / EU" -> "team-alpha-eu". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/** A new profile with a matcher that must be filled in before it can be saved: never `true`, so a
 * fresh profile cannot silently take every event. */
export function newProfile(name: string, registry: RoleRegistry): Profile {
  const taken = new Set([
    DEFAULT_PROFILE_ID,
    ...(registry.profiles ?? []).map((p) => p.id),
  ]);
  const base = slugify(name) || "profile";
  let id = base;
  for (let i = 2; taken.has(id); i += 1) id = `${base}-${i}`;
  return {
    id,
    name: name.trim(),
    pipelineCustomId: `pipeline_severity_assistant_${id.replace(/-/g, "_")}`,
    routeMatcher: "",
    defaultSeverity: { mode: "leave" },
    securityContext: { mode: "none" },
  };
}

/** Ids of stored profiles that are gone from the draft: their leftovers need cleaning up on save. */
export function removedProfileIds(
  stored: readonly Profile[],
  draft: readonly Profile[],
): string[] {
  const keep = new Set(draft.map((p) => p.id));
  return stored.filter((p) => !keep.has(p.id)).map((p) => p.id);
}
