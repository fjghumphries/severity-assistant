/**
 * Human-readable summary of a deploy plan: what a save means in terms of rules (default
 * severities, exceptions, threshold defaults) rather than processor ids and DQL. Changes are
 * derived from the processors the compiler emitted (so they reflect exactly what will be
 * written); names, role labels and detector titles are looked up from the rules/registry.
 */

import type { Rule } from "../types/rule";
import { getConditions } from "../types/rule";
import type { RoleRegistry } from "../types/registry";
import type { DeployPlan, LivePipeline, LiveProcessor } from "./plan";
import { canonical, isOwned, PIPELINE_STAGES } from "./plan";

export type ChangeTone = "added" | "changed" | "removed";

export interface ChangeItem {
  tone: ChangeTone;
  title: string;
  /** One plain-language line: the conditions and the outcome. */
  detail?: string;
  /** What changed, for a "changed" item. */
  changes?: string[];
}

export interface SummaryContext {
  rules: Rule[];
  registry: RoleRegistry;
  /** Detector objectId -> display name, when known. */
  detectorName: (objectId: string) => string | undefined;
}

export interface ChangeSummary {
  defaults: ChangeItem[];
  exceptions: ChangeItem[];
  thresholds: ChangeItem[];
  /** The app-managed dt.security_context assignment. */
  security: ChangeItem[];
  /** Key builder / combiners: regenerated plumbing, not something a rule author edits. */
  internalChanged: boolean;
  /** Pipeline-level settings outside the processors (displayName, metadataList, ...). */
  settings: string[];
  orderChanged: boolean;
}

const sev = (s: string | undefined) =>
  s === undefined ? "not set" : `severity ${s}`;

const script = (p: LiveProcessor): string =>
  (p.dql as { script?: string } | undefined)?.script ?? "";
const matcher = (p: LiveProcessor): string =>
  typeof p.matcher === "string" ? p.matcher : "";
const description = (p: LiveProcessor): string =>
  typeof p.description === "string" ? p.description : "";

const EXCEPTION_PREFIX = /^sevassist_exception_/;
const THRESHOLD_PREFIX = "sevassist_threshold_";
const LOOKUP_PREFIX = "sevassist_default_by_";

/** Name as written into the processor description, used when the rule itself is not at hand
 * (e.g. a rule that was deleted and so only exists in the live pipeline). */
const nameOf = (p: LiveProcessor): string =>
  description(p)
    .replace(/^Severity Assistant:? ?/, "")
    // Old wording ("exception #0: Foo", "threshold default - Foo") and new ("exception #0 - set ...").
    .replace(/^(exception #\d+[:-] ?|threshold default - ?)/, "");

/** The rule identity behind an exception processor id: stable across reordering. */
const exceptionKey = (p: LiveProcessor): string =>
  p.id.replace(EXCEPTION_PREFIX, "");

const exceptionSeverity = (p: LiveProcessor): string | undefined =>
  /dt\.temp\.sev_exception = "(\d)"/.exec(script(p))?.[1];

const isThresholdScript = (p: LiveProcessor): boolean =>
  script(p).startsWith("parse ");

type Family = "event" | "detector";

function lookupTable(
  processors: LiveProcessor[],
): Map<string, { family: Family; severity: string }> {
  const out = new Map<string, { family: Family; severity: string }>();
  for (const p of processors) {
    if (!p.id.startsWith(LOOKUP_PREFIX)) continue;
    const family: Family = p.id.startsWith(`${LOOKUP_PREFIX}detector`)
      ? "detector"
      : "event";
    const raw = (p.inlineLookup as { inlineLookupTable?: string } | undefined)
      ?.inlineLookupTable;
    if (!raw) continue;
    try {
      for (const [keys, severity] of JSON.parse(raw) as [string[], string][]) {
        for (const k of keys) out.set(`${family}:${k}`, { family, severity });
      }
    } catch {
      // Unparseable table: it will still show in the technical details rather than being hidden.
    }
  }
  return out;
}

function ownedProcessors(value: unknown): LiveProcessor[] {
  const v = (value ?? {}) as Record<
    string,
    { processors?: LiveProcessor[] } | undefined
  >;
  return PIPELINE_STAGES.flatMap((stage) => v[stage]?.processors ?? []).filter(
    (p) => isOwned(p.id),
  );
}

/** "Event "X"" / "Detector Y" / "Any event" plus the role conditions, as one phrase. */
export function describeConditions(rule: Rule, ctx: SummaryContext): string {
  const parts: string[] = [];
  if (rule.detector_id)
    parts.push(
      `Detector ${ctx.detectorName(rule.detector_id) ?? rule.detector_id}`,
    );
  else if (rule.event_name) {
    parts.push(
      `Event ${rule.event_name_match === "contains" ? "contains" : "is"} "${rule.event_name}"`,
    );
  } else parts.push("Any event");
  for (const c of getConditions(rule)) {
    if (!c.role) continue;
    const label =
      ctx.registry.roles.find((r) => r.role === c.role)?.label ?? c.role;
    parts.push(c.value ? `${label} = ${c.value}` : `${label} not set`);
  }
  return parts.join(", ");
}

export function describeOutcome(rule: Rule): string {
  if (rule.rule_type === "threshold") {
    return `severity from a number in the event text (bounds ${rule.threshold_bounds ?? "?"})`;
  }
  return sev(rule.severity ?? undefined);
}

/** `beforeIndex`/`afterIndex` are the processor's positions in the live and compiled exception
 * sequences. Position is what decides a tie under D20 (last match wins) and is no longer
 * recoverable from the id, so the caller supplies it. */
function describeException(
  before: LiveProcessor,
  after: LiveProcessor,
  beforeIndex: number,
  afterIndex: number,
): string[] {
  const changes: string[] = [];
  if (nameOf(before) !== nameOf(after))
    changes.push(`renamed from "${nameOf(before)}"`);
  if (beforeIndex !== afterIndex)
    changes.push(`moved from position ${beforeIndex} to ${afterIndex}`);
  if (matcher(before) !== matcher(after)) changes.push("conditions changed");
  if (isThresholdScript(after) || isThresholdScript(before)) {
    if (script(before) !== script(after))
      changes.push("threshold bounds or pattern changed");
  } else if (exceptionSeverity(before) !== exceptionSeverity(after)) {
    changes.push(
      `${sev(exceptionSeverity(before))} to ${sev(exceptionSeverity(after))}`,
    );
  }
  if (before.enabled !== after.enabled)
    changes.push(after.enabled ? "enabled" : "disabled");
  return changes;
}

export function summarizePlan(
  plan: DeployPlan,
  live: LivePipeline | null,
  ctx: SummaryContext,
): ChangeSummary {
  const before = live ? ownedProcessors(live.value) : [];
  const after = ownedProcessors(plan.merged);
  const ruleById = new Map(ctx.rules.map((r) => [r.rule_id, r]));

  // Default severities: diff the combined key -> severity table, ignoring how it is split.
  const defaults: ChangeItem[] = [];
  const bt = lookupTable(before);
  const at = lookupTable(after);
  const labelOf = (compound: string, family: Family): string => {
    const key = compound.slice(compound.indexOf(":") + 1);
    return family === "detector"
      ? `Detector ${ctx.detectorName(key) ?? key}`
      : `Event "${key}"`;
  };
  for (const [k, v] of [...at].sort(([a], [b]) => a.localeCompare(b))) {
    const old = bt.get(k);
    if (!old)
      defaults.push({
        tone: "added",
        title: labelOf(k, v.family),
        detail: sev(v.severity),
      });
    else if (old.severity !== v.severity) {
      defaults.push({
        tone: "changed",
        title: labelOf(k, v.family),
        detail: `${sev(old.severity)} to ${sev(v.severity)}`,
      });
    }
  }
  for (const [k, v] of [...bt].sort(([a], [b]) => a.localeCompare(b))) {
    if (!at.has(k))
      defaults.push({
        tone: "removed",
        title: labelOf(k, v.family),
        detail: `was ${sev(v.severity)}`,
      });
  }

  // Exceptions: pair by rule identity so a reorder reads as "moved", not remove + add.
  const exceptions: ChangeItem[] = [];
  const isExc = (p: LiveProcessor) => EXCEPTION_PREFIX.test(p.id);
  const bx = new Map(before.filter(isExc).map((p) => [exceptionKey(p), p]));
  const ax = new Map(after.filter(isExc).map((p) => [exceptionKey(p), p]));
  // The processor id no longer carries `order` (it is the array position), so the displayed
  // position comes from the rule, falling back to the processor's index for a rule that only
  // exists in the live pipeline because it has since been deleted.
  const excTitle = (p: LiveProcessor, index: number) => {
    const rule = ruleById.get(exceptionKey(p));
    return `#${rule?.order ?? index} ${rule?.name ?? nameOf(p)}`;
  };
  const bxIndex = new Map([...bx.keys()].map((k, i) => [k, i]));
  [...ax.entries()].forEach(([k, p], index) => {
    const old = bx.get(k);
    const rule = ruleById.get(k);
    const detail = rule
      ? `${describeConditions(rule, ctx)} -> ${describeOutcome(rule)}`
      : undefined;
    if (!old)
      exceptions.push({ tone: "added", title: excTitle(p, index), detail });
    else {
      const changes = describeException(old, p, bxIndex.get(k) ?? index, index);
      if (changes.length > 0)
        exceptions.push({
          tone: "changed",
          title: excTitle(p, index),
          detail,
          changes,
        });
    }
  });
  [...bx.entries()].forEach(([k, p], index) => {
    if (!ax.has(k))
      exceptions.push({ tone: "removed", title: excTitle(p, index) });
  });

  // Threshold Defaults: one processor per rule.
  const thresholds: ChangeItem[] = [];
  const isThr = (p: LiveProcessor) => p.id.startsWith(THRESHOLD_PREFIX);
  const bn = new Map(before.filter(isThr).map((p) => [p.id, p]));
  const an = new Map(after.filter(isThr).map((p) => [p.id, p]));
  const thrTitle = (p: LiveProcessor) =>
    ruleById.get(p.id.slice(THRESHOLD_PREFIX.length))?.name ?? nameOf(p);
  for (const [id, p] of an) {
    const old = bn.get(id);
    const rule = ruleById.get(id.slice(THRESHOLD_PREFIX.length));
    const detail = rule
      ? `${describeConditions(rule, ctx)} -> ${describeOutcome(rule)}`
      : undefined;
    if (!old) thresholds.push({ tone: "added", title: thrTitle(p), detail });
    else if (script(old) !== script(p) || matcher(old) !== matcher(p)) {
      thresholds.push({
        tone: "changed",
        title: thrTitle(p),
        detail,
        changes: ["bounds, pattern or match conditions changed"],
      });
    }
  }
  for (const [id, p] of bn)
    if (!an.has(id)) thresholds.push({ tone: "removed", title: thrTitle(p) });

  // Security context: a single app-owned processor in the securityContext stage.
  const security: ChangeItem[] = [];
  const SEC_ID = "sevassist_security_context";
  const bs = before.find((p) => p.id === SEC_ID);
  const as = after.find((p) => p.id === SEC_ID);
  const secTitle = "Security context (dt.security_context)";
  if (as && !bs)
    security.push({ tone: "added", title: secTitle, detail: nameOf(as) });
  else if (as && bs && canonical(as) !== canonical(bs)) {
    security.push({
      tone: "changed",
      title: secTitle,
      detail: nameOf(as),
      changes: [`was: ${nameOf(bs)}`],
    });
  } else if (!as && bs)
    security.push({ tone: "removed", title: secTitle, detail: nameOf(bs) });

  const internalChanged = plan.processorChanges.some((c) =>
    /^sevassist_(build_keys|apply_severity|default_combine)/.test(c.id),
  );

  return {
    defaults,
    exceptions,
    thresholds,
    security,
    internalChanged,
    settings: plan.otherChanges.map((f) => f.path),
    orderChanged: plan.orderChanged,
  };
}

const TONES: ChangeTone[] = ["added", "changed", "removed"];

/** One line for the deploy confirmation, in rule terms ("1 exception changed (#0 Foo)") rather than
 * processor counts. A reorder reads as "changed" because exceptions are paired by rule identity. */
export function describeChangeLine(s: ChangeSummary): string {
  const parts: string[] = [];
  const group = (noun: string, items: ChangeItem[]) => {
    for (const tone of TONES) {
      const xs = items.filter((i) => i.tone === tone);
      if (xs.length === 0) continue;
      const names =
        xs
          .slice(0, 3)
          .map((i) => i.title)
          .join(", ") + (xs.length > 3 ? `, +${xs.length - 3} more` : "");
      parts.push(
        `${xs.length} ${noun}${xs.length === 1 ? "" : "s"} ${tone} (${names})`,
      );
    }
  };
  group("default", s.defaults);
  group("exception", s.exceptions);
  group("threshold default", s.thresholds);
  s.security.forEach((i) => parts.push(`security context ${i.tone}`));
  if (s.internalChanged) parts.push("generated plumbing regenerated");
  if (s.settings.length > 0)
    parts.push(
      `${s.settings.length} pipeline setting${s.settings.length === 1 ? "" : "s"} changed`,
    );
  // `orderChanged` is only set when nothing was added or removed (see plan.ts), i.e. a pure
  // reorder, so it is always worth stating rather than only as a last resort.
  if (s.orderChanged) parts.push("exception order changed");
  return parts.length > 0 ? parts.join("; ") : "no rule-level changes";
}

const TONE_WORD: Record<ChangeTone, string> = {
  added: "Add",
  changed: "Change",
  removed: "Remove",
};

/**
 * One line per change, for the deploy confirmation: "Add default: CPU (severity 3)",
 * "Change exception: Foo -- severity 2 -> 1". `describeChangeLine` stays as the one-sentence form.
 */
export function describeChangeLines(s: ChangeSummary): string[] {
  const lines: string[] = [];
  const add = (noun: string, items: ChangeItem[]) => {
    for (const tone of TONES) {
      for (const i of items.filter((x) => x.tone === tone)) {
        const extra =
          tone === "changed" && i.changes && i.changes.length > 0
            ? i.changes.join("; ")
            : i.detail;
        lines.push(
          `${TONE_WORD[tone]} ${noun}: ${i.title}${extra ? ` -- ${extra}` : ""}`,
        );
      }
    }
  };
  add("default", s.defaults);
  add("exception", s.exceptions);
  add("threshold default", s.thresholds);
  add("security context", s.security);
  if (s.internalChanged) lines.push("Regenerate the app's own plumbing");
  for (const setting of s.settings) lines.push(`Pipeline setting: ${setting}`);
  if (s.orderChanged) lines.push("Change the order of exceptions");
  return lines;
}
