import {
  BUILT_IN_ROLE_TEMPLATES,
  emptyRegistry,
  type RoleRegistry,
} from "../types/registry";

/** Default field guesses for the built-in labels, from docs/10-phase0-results.md. Only a starting
 * point for first-run setup: always shown editable, never assumed silently. */
export const DEFAULT_FIELD_GUESSES: Record<string, string> = {
  business_unit: "primary_tags.bu",
  application: "primary_tags.landscape",
  tier: "primary_tags.tier",
  stage: "primary_tags.stage",
};

/** The registry a first run starts from: the built-in labels with guessed fields, not yet saved. */
export function firstRunRegistry(): RoleRegistry {
  const base = emptyRegistry();
  base.roles = BUILT_IN_ROLE_TEMPLATES.map((t) => ({
    role: t.role,
    label: t.label,
    field: DEFAULT_FIELD_GUESSES[t.role] ?? "",
    cardinality: "single",
    enabled: true,
  }));
  return base;
}

/** True when no label is usable in a rule yet, i.e. setup has not been done (or was skipped). */
export function needsSetup(registry: RoleRegistry | null): boolean {
  if (!registry) return false;
  return !registry.roles.some(
    (r) => r.enabled && r.cardinality === "single" && r.field.trim() !== "",
  );
}
