/**
 * Rules export/import: the settings a person built (labels, profiles, rules) as one versioned JSON
 * file on their own computer. Unlike a pipeline backup, which holds compiled output that cannot be
 * turned back into rules, this is the source, so it can be restored, copied to another tenant or
 * kept in version control. Pure: reading and writing App State happens in the caller, and nothing
 * here deploys anything.
 */

import { normalizeRuleRecord } from "../config/rulesSerialization";
import { validateRule, findDuplicateRules } from "../config/validateRule";
import { validateRegistry } from "../config/validateRegistry";
import { DEFAULT_PROFILE_ID } from "../config/profiles";
import type { RoleRegistry } from "../types/registry";
import type { Rule } from "../types/rule";

export const RULES_EXPORT_FORMAT = "severity-assistant-rules";
/** Bump when the shape changes and add a step to `migrate`, so old exports stay importable. */
export const RULES_EXPORT_VERSION = 1;

export interface RulesExport {
  format: typeof RULES_EXPORT_FORMAT;
  version: number;
  createdAt: string;
  /** Labels, limits, the default profile's own settings and every extra profile. */
  registry: RoleRegistry;
  /** Rules by profile id; the default profile's id is "default". */
  rules: Record<string, Rule[]>;
}

export type ImportMode = "merge" | "replace";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function makeRulesExport(
  registry: RoleRegistry,
  rulesByProfile: Record<string, Rule[]>,
  now: Date = new Date(),
): RulesExport {
  return {
    format: RULES_EXPORT_FORMAT,
    version: RULES_EXPORT_VERSION,
    createdAt: now.toISOString(),
    registry,
    rules: rulesByProfile,
  };
}

export function rulesExportFileName(createdAt: string): string {
  return `severity-assistant-rules-${createdAt.replace(/[:.]/g, "-")}.json`;
}

/** Upgrades an older export to the current shape. Only version 1 exists so far. */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  return raw;
}

export interface ParsedImport {
  data: RulesExport;
  /** Problems found in the file's own contents. Non-empty means it must not be applied. */
  issues: string[];
}

/**
 * Parses an export file. Throws an Error with a user-facing message when the file is not one at
 * all; returns `issues` for a file that is one but holds invalid rules or labels, so the preview
 * can list every problem at once.
 */
export function parseRulesExport(text: string): ParsedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!isRecord(raw) || raw.format !== RULES_EXPORT_FORMAT) {
    throw new Error("This file is not a Severity Assistant rules export.");
  }
  if (typeof raw.version !== "number" || raw.version < 1) {
    throw new Error("The export has no valid version.");
  }
  if (raw.version > RULES_EXPORT_VERSION) {
    throw new Error(
      `This export is version ${raw.version}; this app reads up to version ${RULES_EXPORT_VERSION}. Update the app first.`,
    );
  }
  const m = migrate(raw);
  if (!isRecord(m.registry) || !Array.isArray(m.registry.roles)) {
    throw new Error("The export has no labels section.");
  }
  if (!isRecord(m.rules)) throw new Error("The export has no rules section.");

  const registry = m.registry as unknown as RoleRegistry;
  const rules: Record<string, Rule[]> = {};
  const issues: string[] = [];

  for (const [id, list] of Object.entries(m.rules)) {
    if (!Array.isArray(list)) {
      issues.push(`Rules for "${id}" are not a list.`);
      continue;
    }
    rules[id] = list.map((r) => normalizeRuleRecord(isRecord(r) ? r : {}));
  }

  for (const i of validateRegistry(registry)) issues.push(i.message);
  const known = new Set([
    DEFAULT_PROFILE_ID,
    ...(registry.profiles ?? []).map((p) => p.id),
  ]);
  for (const [id, list] of Object.entries(rules)) {
    if (!known.has(id))
      issues.push(
        `Rules refer to team "${id}", which the export does not define.`,
      );
    for (const rule of list)
      for (const i of validateRule(rule, registry)) issues.push(i.message);
    for (const i of findDuplicateRules(list)) issues.push(i.message);
  }

  return {
    data: {
      format: RULES_EXPORT_FORMAT,
      version: RULES_EXPORT_VERSION,
      createdAt: typeof m.createdAt === "string" ? m.createdAt : "",
      registry,
      rules,
    },
    issues,
  };
}

export interface ImportResult {
  registry: RoleRegistry;
  rules: Record<string, Rule[]>;
  summary: {
    labelsAdded: number;
    profilesAdded: number;
    rulesAdded: number;
    rulesSkipped: number;
  };
}

/**
 * What the stored state becomes. "replace" takes the file as is. "merge" keeps everything already
 * there and adds what is missing: labels and profiles by id, rules by rule id (an existing rule
 * wins, so a merge never changes a rule the user already has). Rule ids are kept either way.
 */
export function planImport(
  current: { registry: RoleRegistry; rules: Record<string, Rule[]> },
  incoming: RulesExport,
  mode: ImportMode,
): ImportResult {
  if (mode === "replace") {
    const rulesAdded = Object.values(incoming.rules).reduce(
      (n, l) => n + l.length,
      0,
    );
    return {
      registry: incoming.registry,
      rules: incoming.rules,
      summary: {
        labelsAdded: incoming.registry.roles.length,
        profilesAdded: (incoming.registry.profiles ?? []).length,
        rulesAdded,
        rulesSkipped: 0,
      },
    };
  }

  const haveRole = new Set(current.registry.roles.map((r) => r.role));
  const newRoles = incoming.registry.roles.filter((r) => !haveRole.has(r.role));
  const haveProfile = new Set(
    (current.registry.profiles ?? []).map((p) => p.id),
  );
  const newProfiles = (incoming.registry.profiles ?? []).filter(
    (p) => !haveProfile.has(p.id),
  );
  const registry: RoleRegistry = {
    ...current.registry,
    roles: [...current.registry.roles, ...newRoles],
    profiles: [...(current.registry.profiles ?? []), ...newProfiles],
  };

  const rules: Record<string, Rule[]> = { ...current.rules };
  let rulesAdded = 0;
  let rulesSkipped = 0;
  for (const [id, list] of Object.entries(incoming.rules)) {
    const existing = rules[id] ?? [];
    const have = new Set(existing.map((r) => r.rule_id));
    const fresh = list.filter((r) => !have.has(r.rule_id));
    rulesSkipped += list.length - fresh.length;
    rulesAdded += fresh.length;
    rules[id] = [...existing, ...fresh];
  }

  return {
    registry,
    rules,
    summary: {
      labelsAdded: newRoles.length,
      profilesAdded: newProfiles.length,
      rulesAdded,
      rulesSkipped,
    },
  };
}
