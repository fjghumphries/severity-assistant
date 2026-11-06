import { matcherProblems } from "../compiler/syntax";
import { RoleRegistry } from "../types/registry";
import { DEFAULT_PROFILE_NAME } from "./profiles";

export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Pure validation for the role registry. No I/O -- callers run this before every save.
 * Mirrors the guards in docs/02-architecture-and-decisions.md (D9a) and
 * docs/03-config-store-and-rule-model.md.
 */
export function validateRegistry(registry: RoleRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (registry.maxConditionsPerRule < 1 || registry.maxConditionsPerRule > 10) {
    issues.push({
      field: "maxConditionsPerRule",
      message: "Must be between 1 and 10.",
    });
  }

  const roleIds = new Set<string>();

  for (const role of registry.roles) {
    if (!role.role.trim()) {
      issues.push({
        field: `roles`,
        message: "A role cannot have an empty id.",
      });
      continue;
    }
    if (roleIds.has(role.role)) {
      issues.push({
        field: `roles.${role.role}`,
        message: `Duplicate role id "${role.role}".`,
      });
    }
    roleIds.add(role.role);

    if (!role.field.trim()) {
      issues.push({
        field: `roles.${role.role}`,
        message: `Role "${role.label}" has no field mapped. Map a field or disable it.`,
      });
    }
  }

  const enabledCount = registry.roles.filter((r) => r.enabled).length;
  if (enabledCount > 6) {
    issues.push({
      field: "roles",
      message: `${enabledCount} labels enabled. Each one adds a condition slot to every rule editor -- consider disabling unused labels.`,
    });
  }

  // Per-profile settings: the default profile (top-level fields, messages unchanged) and every
  // additional profile (prefixed with its name so the user knows which one to fix).
  issues.push(...validateProfileSettings(registry, ""));
  const seenIds = new Set<string>(["default"]);
  const seenNames = new Set<string>([DEFAULT_PROFILE_NAME.toLowerCase()]);
  const seenPipelines = new Set<string>([registry.pipelineCustomId.trim()]);
  for (const p of registry.profiles ?? []) {
    const where = `Profile "${p.name || p.id}": `;
    if (!p.name.trim())
      issues.push({
        field: `profiles.${p.id}.name`,
        message: `${where}name cannot be empty.`,
      });
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p.id) || seenIds.has(p.id)) {
      issues.push({
        field: `profiles.${p.id}.id`,
        message: `${where}id "${p.id}" is invalid or already used.`,
      });
    }
    seenIds.add(p.id);
    const lname = p.name.trim().toLowerCase();
    if (lname && seenNames.has(lname)) {
      issues.push({
        field: `profiles.${p.id}.name`,
        message: `${where}another profile already has this name.`,
      });
    }
    seenNames.add(lname);
    const cid = p.pipelineCustomId.trim();
    if (cid && seenPipelines.has(cid)) {
      issues.push({
        field: `profiles.${p.id}.pipelineCustomId`,
        message: `${where}pipeline custom ID "${cid}" is already used by another profile.`,
      });
    }
    seenPipelines.add(cid);
    issues.push(...validateProfileSettings(p, where, `profiles.${p.id}.`));
  }

  return issues;
}

export function isValid(registry: RoleRegistry): boolean {
  return validateRegistry(registry).length === 0;
}

type ProfileSettings = Pick<
  RoleRegistry,
  "routeMatcher" | "pipelineCustomId" | "defaultSeverity" | "securityContext"
>;

function validateProfileSettings(
  p: ProfileSettings,
  where: string,
  fieldPrefix = "",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: string, message: string) =>
    issues.push({ field: fieldPrefix + field, message: where + message });

  if (p.defaultSeverity.mode !== "leave") {
    const v = p.defaultSeverity.value;
    if (!v || !/^[1-5]$/.test(v)) {
      add(
        "defaultSeverity",
        `Mode "${p.defaultSeverity.mode}" requires a value of "1" through "5".`,
      );
    }
  }

  const sc = p.securityContext;
  if (sc && sc.mode !== "none") {
    const v = (sc.value ?? "").trim();
    if (!v) {
      add(
        "securityContext",
        `Security context mode "${sc.mode}" needs a value.`,
      );
    } else if (
      sc.mode === "field" &&
      !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_-]+)*$/.test(v)
    ) {
      add(
        "securityContext",
        `"${v}" is not a plain field path such as primary_tags.bu.`,
      );
    } else if (sc.mode === "constant" && v.length > 1024) {
      add(
        "securityContext",
        "Security context constant is limited to 1024 characters.",
      );
    }
  }

  if (!p.routeMatcher.trim()) {
    add("routeMatcher", "Route matcher cannot be empty.");
  } else {
    for (const problem of matcherProblems(p.routeMatcher))
      add("routeMatcher", `Route matcher: ${problem}`);
  }

  if (!p.pipelineCustomId.trim()) {
    add("pipelineCustomId", "Pipeline custom ID cannot be empty.");
  }
  return issues;
}
