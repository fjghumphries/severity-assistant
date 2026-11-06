/**
 * Plain-language processor descriptions. Pure: shown in the OpenPipeline UI, where a person reads
 * what each generated processor does. Nothing parses these for logic; `deploy/describe.ts` only
 * strips the prefix to get a fallback title for a rule that no longer exists.
 */

import { DefaultSeverity, RoleRegistry } from "../types/registry";
import { getConditions, Rule } from "../types/rule";

export const DESCRIPTION_PREFIX = "Severity Assistant: ";
const MAX_CHARS = 500; // validate.ts rejects descriptions over 512

const clip = (s: string): string =>
  s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 3)}...` : s;

export const withPrefix = (text: string): string =>
  clip(`${DESCRIPTION_PREFIX}${text}`);

/** "events named "Foo"", "events whose name contains "Foo"", or the detector the rule is keyed on. */
export function describeTarget(rule: Rule): string {
  if (rule.event_name !== null) {
    return rule.event_name_match === "contains"
      ? `events whose name contains "${rule.event_name}"`
      : `events named "${rule.event_name}"`;
  }
  if (rule.detector_id !== null) {
    return `events from the anomaly detector in rule "${rule.name}"`;
  }
  return "any event";
}

/** " when Business Unit = bu1 and Tier = bronze", or "" when the rule has no conditions. */
export function describeWhen(rule: Rule, registry: RoleRegistry): string {
  const parts = getConditions(rule)
    .filter((c) => c.role !== null)
    .map((c) => {
      const label =
        registry.roles.find((r) => r.role === c.role)?.label ?? c.role;
      return (c.value ?? "") === ""
        ? `${label} is not set`
        : `${label} = ${c.value}`;
    });
  return parts.length > 0 ? ` when ${parts.join(" and ")}` : "";
}

/** ">=50 -> 1, >=20 -> 2, >=10 -> 3, >=5 -> 4, else 5" from the rule's bounds. */
export function describeBands(rule: Rule): string {
  const bounds = (rule.threshold_bounds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const bands = bounds.map((b, i) => `>=${b} -> ${i + 1}`);
  return [...bands, "else 5"].join(", ");
}

/** What a threshold rule does, for use in a sentence: the number comes from event.description. */
export const THRESHOLD_SOURCE = "from a number in the event description";

export function describeFallback(setting: DefaultSeverity): string {
  if (setting.mode === "leave") return "keep their own severity";
  if (setting.mode === "flag")
    return `get severity ${setting.value} and are flagged sa.unmatched`;
  return `get severity ${setting.value}`;
}
