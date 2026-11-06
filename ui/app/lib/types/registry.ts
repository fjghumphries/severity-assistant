/**
 * The role registry: which tenant field or tag backs each semantic role, plus global
 * compiler/pipeline settings. See docs/03-config-store-and-rule-model.md Part 1.
 *
 * Stored as a single JSON blob in the App State Service (cross-user, app-wide) under
 * APP_STATE_KEY -- see lib/config/registry.ts.
 */

export type RoleCardinality = "single" | "multi";

export interface RoleDefinition {
  /** Stable identifier. Rules reference this, never the raw field path. */
  role: string;
  /** UI display name, shown everywhere instead of the Grail field path. */
  label: string;
  /** The tenant field or tag backing this role, e.g. "primary_tags.bu". Remappable. */
  field: string;
  /** Only "single" roles may be used in rules (D10) -- multi-value fields are read-only. */
  cardinality: RoleCardinality;
  /** Disabled roles are hidden from the rule editor but not deleted. */
  enabled: boolean;
}

export type DefaultSeverityMode = "leave" | "set" | "flag";

export interface DefaultSeverity {
  mode: DefaultSeverityMode;
  /** Required when mode is "set" or "flag". A string "1".."5". */
  value?: string;
}

/** How the app sets `dt.security_context` (who may see the events, via IAM). "none" = the app
 * leaves the stage alone, and anything already there is preserved. */
export type SecurityContextMode = "none" | "field" | "constant";

export interface SecurityContextSetting {
  mode: SecurityContextMode;
  /** "field": the event field to copy from, e.g. primary_tags.bu. "constant": the literal value. */
  value?: string;
}

/**
 * An additional, independent pipeline + route managed by the app (the "default" profile is the
 * registry's own top-level fields, unchanged from before profiles existed). Roles are shared;
 * everything here is per profile, and so are the rules (see `rulesKeyFor`).
 */
export interface Profile {
  /** Stable slug, used in the rules storage key and the pipeline's customId. */
  id: string;
  /** Shown in the app and in the pipeline/route names so managed objects are identifiable. */
  name: string;
  pipelineCustomId: string;
  routeMatcher: string;
  defaultSeverity: DefaultSeverity;
  securityContext?: SecurityContextSetting;
}

export interface RoleRegistry {
  maxConditionsPerRule: number;
  roles: RoleDefinition[];
  defaultSeverity: DefaultSeverity;
  /** OpenPipeline routing matcher for this app's route. Default "true". */
  routeMatcher: string;
  pipelineCustomId: string;
  /** Optional: registries saved before this existed have none, which means mode "none". */
  securityContext?: SecurityContextSetting;
  /** Additional profiles beyond the default one. Absent = only the default profile. */
  profiles?: Profile[];
  /** Set only on the per-profile view built by `effectiveRegistry`, never stored. */
  pipelineDisplayName?: string;
  /** Set only on the per-profile view built by `effectiveRegistry`, never stored. */
  routeDescription?: string;
}

export const DEFAULT_MAX_CONDITIONS_PER_RULE = 4;

/** The four built-in roles from the original test tenant (docs/10-phase0-results.md). Used only
 * as a starting point for the guided setup flow -- never assumed to exist without user
 * confirmation, since field names differ per tenant. */
export const BUILT_IN_ROLE_TEMPLATES: { role: string; label: string }[] = [
  { role: "business_unit", label: "Business Unit" },
  { role: "application", label: "Application" },
  { role: "tier", label: "Tier" },
  { role: "stage", label: "Stage" },
];

export function emptyRegistry(): RoleRegistry {
  return {
    maxConditionsPerRule: DEFAULT_MAX_CONDITIONS_PER_RULE,
    roles: [],
    defaultSeverity: { mode: "leave" },
    routeMatcher: "true",
    pipelineCustomId: "pipeline_severity_assistant_v1",
  };
}
