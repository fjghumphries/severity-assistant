import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Paragraph } from "@dynatrace/strato-components/typography";
import {
  TextInput,
  Select,
  RadioGroup,
  Radio,
  NumberInputV2 as NumberInput,
} from "@dynatrace/strato-components/forms";
import { Button } from "@dynatrace/strato-components/buttons";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { CriticalIcon } from "@dynatrace/strato-icons";

import { RoleRegistry } from "../../lib/types/registry";
import {
  Rule,
  RuleCondition,
  RuleType,
  getConditions,
} from "../../lib/types/rule";
import { AnomalyDetectorOption } from "../../lib/queries/useAnomalyDetectors";
import { EventCatalogueEntry } from "../../lib/queries/derive";
import { HelpTip } from "../../components/HelpTip";
import { severityText } from "../../components/SeverityBadge";
import { EventNameField } from "./EventPicker";
import { PatternSuggestions } from "./PatternSuggestions";

/** Sentinel for "(no role condition)" in a Role select -- Select.Option values must be
 * strings, so `null` (the real "no role" state) can't be used as an option value directly. */
export const NO_ROLE_VALUE = "__none__";

export const SEVERITY_OPTIONS = ["1", "2", "3", "4", "5"];

export type MatchMode = "event" | "detector";

export type SaveState = "idle" | "saving" | "error";

export function roleLabel(registry: RoleRegistry, role: string | null): string {
  if (role === null) return "";
  return registry.roles.find((r) => r.role === role)?.label ?? role;
}

export function conditionsSummary(registry: RoleRegistry, rule: Rule): string {
  const parts = getConditions(rule)
    .filter((c) => c.role !== null)
    .map(
      (c) =>
        `${roleLabel(registry, c.role)} = ${c.value === "" ? "(not set)" : c.value}`,
    );
  return parts.length > 0 ? parts.join(", ") : "(no conditions)";
}

/** Builds a lookup from a detector's stable objectId to its human-readable name (D18). */
export function useDetectorNameLookup(detectors: AnomalyDetectorOption[]) {
  return useMemo(() => {
    const byId = new Map(detectors.map((d) => [d.objectId, d.name]));
    return (objectId: string) => byId.get(objectId) ?? objectId;
  }, [detectors]);
}

/** Human-readable target label, used in table rows and text-search filters alike. */
export function targetLabel(
  rule: Rule,
  detectorName: (id: string) => string,
): string {
  if (rule.detector_id !== null)
    return `Detector: ${detectorName(rule.detector_id)}`;
  return rule.event_name ?? "(any event)";
}

/**
 * Table "Severity" column text. A threshold rule always has `severity: null` (validateRule
 * requires it), so `row.severity ?? "-"` alone renders every threshold rule as an unconfigured
 * "-" -- indistinguishable from a broken rule. Surface the bounds instead.
 */
export function severityColumnText(rule: Rule): string {
  if (rule.rule_type === "threshold") {
    return rule.threshold_bounds
      ? `By value (${rule.threshold_bounds})`
      : "By value (unconfigured)";
  }
  return rule.severity ?? "-";
}

/**
 * `Rule.name` is a required field (`validateRule` rejects an empty one), but it is pure UI
 * labelling -- nothing in the compiler reads it. Forcing the user to type a second, redundant
 * label in addition to the target/conditions they just picked produced a confusing "name cannot
 * be empty" rejection (the error prefix falls back to the generated `rule_id`, which looks like
 * a bug report, not a usable message). Derive a sensible default instead, so leaving the Name
 * field blank just works.
 */
export function deriveRuleName(params: {
  typedName: string;
  matchMode: MatchMode;
  eventName: string;
  detectorId: string | null;
  detectorName: (id: string) => string;
  conditionsSummaryText?: string;
}): string {
  const typed = params.typedName.trim();
  if (typed !== "") return typed;

  const target =
    params.matchMode === "detector"
      ? params.detectorId !== null
        ? `Detector: ${params.detectorName(params.detectorId)}`
        : "(no detector selected)"
      : params.eventName.trim() !== ""
        ? params.eventName.trim()
        : "(any event)";

  return params.conditionsSummaryText &&
    params.conditionsSummaryText !== "(no conditions)"
    ? `${target} -- ${params.conditionsSummaryText}`
    : target;
}

export const usableRoles = (registry: RoleRegistry | null) =>
  (registry?.roles ?? []).filter(
    (r) => r.enabled && r.cardinality === "single",
  );

/** Small subdued explanatory line, matching the pattern already used in Settings.tsx. */
export const Hint = ({ children }: { children: React.ReactNode }) => (
  <HelpTip>{children}</HelpTip>
);

export const ErrorLine = ({ message }: { message: string }) => (
  <Paragraph style={{ color: Colors.Text.Critical.Default }}>
    <CriticalIcon /> {message}
  </Paragraph>
);

/**
 * Shared event-name / detector target picker, used by both the Defaults and Exceptions add/edit
 * forms. Extracted from the original single-list Rules.tsx so both screens get the same
 * creatable-combobox-with-suggestions behaviour (docs/05-ui-spec.md) instead of two divergent
 * copies.
 */
export function TargetPicker(props: {
  matchMode: MatchMode;
  setMatchMode: (m: MatchMode) => void;
  eventName: string;
  setEventName: (v: string) => void;
  detectorId: string | null;
  setDetectorId: (v: string | null) => void;
  eventCatalogue: EventCatalogueEntry[];
  detectors: AnomalyDetectorOption[];
  eventNameBlankHint: string;
  /** Event names already targeted by another rule in this profile. */
  usedEventNames: Set<string>;
}) {
  const {
    matchMode,
    setMatchMode,
    eventName,
    setEventName,
    detectorId,
    setDetectorId,
    eventCatalogue,
    detectors,
    eventNameBlankHint,
    usedEventNames,
  } = props;

  return (
    <>
      <Flex flexDirection="column" gap={4}>
        <Paragraph>Match on</Paragraph>
        <Flex gap={8}>
          <Button
            variant={matchMode === "event" ? "accent" : "default"}
            onClick={() => setMatchMode("event")}
          >
            Event name
          </Button>
          <Button
            variant={matchMode === "detector" ? "accent" : "default"}
            onClick={() => setMatchMode("detector")}
          >
            Anomaly detector
          </Button>
        </Flex>
        <Hint>
          Prefer &quot;Anomaly detector&quot; for custom-metric alerts -- their
          event name can bake in a literal value (like a static threshold, e.g.
          &quot;CPU is above the static 90% threshold&quot;) that silently stops
          matching if the detector is later reconfigured. Detector identity
          stays stable across those edits.
        </Hint>
      </Flex>

      {matchMode === "event" ? (
        <EventNameField
          eventName={eventName}
          setEventName={setEventName}
          placeholder={eventNameBlankHint}
          usedEventNames={usedEventNames}
          eventCatalogue={eventCatalogue}
        />
      ) : (
        <Flex flexDirection="column" gap={2}>
          <Paragraph>Anomaly detector</Paragraph>
          <Select
            value={detectorId ?? undefined}
            onChange={(v) => setDetectorId(v ?? null)}
          >
            <Select.Trigger width="full" />
            <Select.Filter />
            <Select.Content width="trigger">
              {detectors.map((d) => (
                <Select.Option key={d.objectId} value={d.objectId}>
                  {d.name}
                </Select.Option>
              ))}
            </Select.Content>
          </Select>
          {detectors.length === 0 && (
            <Hint>No anomaly detectors found (or still loading).</Hint>
          )}
        </Flex>
      )}
    </>
  );
}

/** A single role+value editor row, used by the Exceptions repeatable condition editor. */
export function ConditionRow(props: {
  registry: RoleRegistry;
  condition: RuleCondition;
  otherUsedRoles: string[];
  onChange: (next: RuleCondition) => void;
  onRemove: () => void;
}) {
  const { registry, condition, otherUsedRoles, onChange, onRemove } = props;
  const roles = usableRoles(registry);

  return (
    <Flex gap={16} flexFlow="wrap" alignItems="flex-end">
      <Flex flexDirection="column" gap={2} style={{ minWidth: 200, flex: 1 }}>
        <Paragraph>Role</Paragraph>
        <Select
          value={condition.role ?? NO_ROLE_VALUE}
          onChange={(v) =>
            onChange({
              ...condition,
              role: !v || v === NO_ROLE_VALUE ? null : v,
            })
          }
        >
          <Select.Trigger width="full" />
          <Select.Content width="trigger">
            <Select.Option value={NO_ROLE_VALUE}>(unused)</Select.Option>
            {roles.map((r) => (
              <Select.Option
                key={r.role}
                value={r.role}
                disabled={otherUsedRoles.includes(r.role)}
              >
                {r.label}
              </Select.Option>
            ))}
          </Select.Content>
        </Select>
      </Flex>
      <Flex flexDirection="column" gap={2} style={{ minWidth: 160, flex: 1 }}>
        <Paragraph>Value (blank = not set)</Paragraph>
        <TextInput
          value={condition.value ?? ""}
          onChange={(v) => onChange({ ...condition, value: v })}
          disabled={condition.role === null}
        />
      </Flex>
      <Button variant="emphasized" onClick={onRemove}>
        Remove
      </Button>
    </Flex>
  );
}

/** Severity picker -- kept as a plain Select for now (see Rules-split report: the five-chip
 * colour-coded picker from docs/05-ui-spec.md is deliberately deferred, this reuses the
 * already-proven control from the original single-list Rules.tsx). */
export function SeverityPicker(props: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={props.value} onChange={(v) => v && props.onChange(v)}>
      <Select.Trigger width="full" />
      <Select.Content width="trigger">
        {SEVERITY_OPTIONS.map((s) => (
          <Select.Option key={s} value={s}>
            {severityText(s)}
          </Select.Option>
        ))}
      </Select.Content>
    </Select>
  );
}

/**
 * First choice in the rule editor (docs/05-ui-spec.md "How should severity be decided?"),
 * shared by Defaults and Exceptions -- a threshold rule is just an alternate way of deciding
 * severity for either family, not a third rule category.
 */
export function RuleTypePicker(props: {
  value: RuleType;
  onChange: (v: RuleType) => void;
}) {
  return (
    <Flex flexDirection="column" gap={4}>
      <Paragraph>How should severity be decided?</Paragraph>
      <RadioGroup
        value={props.value}
        onChange={(v) => props.onChange(v as RuleType)}
      >
        <Flex flexDirection="column" gap={4}>
          <Radio value="keyed">
            Fixed severity -- always the same severity when this event and
            metadata match.
          </Radio>
          <Radio value="threshold">
            Severity from a number in the event -- extract a number from the
            event description and map ranges to severities 1-5.
          </Radio>
        </Flex>
      </RadioGroup>
    </Flex>
  );
}

/**
 * Seeded from the eight real, working DPL `parse` statements salvaged from the tenant's old
 * pipeline (docs/09-migration-from-existing-pipeline.md, "The one thing worth salvaging"), each
 * adapted to capture into the fixed name the compiler requires (`sa_v`, see
 * `ui/app/lib/compiler/compile.ts`'s `SA_CAPTURE_RE`) instead of the old pipeline's original
 * capture name. `defaultBounds` are the old pipeline's three severity cutoffs (docs/09's table)
 * extended with a sensible fourth boundary below them, since this app's model uses four bounds
 * / five severities where the old pipeline used three plus a `99` sentinel -- purely a starting
 * point loaded into the four number inputs on first pick; the user can change them freely.
 */
export interface ThresholdPatternPreset {
  id: string;
  label: string;
  pattern: string;
  sampleDescription: string;
  defaultBounds: [number, number, number, number];
}

export const THRESHOLD_PATTERN_PRESETS: ThresholdPatternPreset[] = [
  {
    id: "error_rate_increased_to",
    label: 'Error rate -- "increased to"',
    pattern: "DATA 'increased to 'INT:sa_v",
    sampleDescription: "Failure rate increased to 42%",
    defaultBounds: [50, 20, 10, 5],
  },
  {
    id: "error_rate_increase_of_errors_to",
    label: 'Error rate -- "increase of errors to"',
    pattern: "DATA 'increase of errors to 'INT:sa_v",
    sampleDescription: "Detected an increase of errors to 42%",
    defaultBounds: [50, 20, 10, 5],
  },
  {
    id: "error_rate_js_errors",
    label: "Error rate -- JavaScript errors",
    pattern: "DATA 'unexpected increase of JavaScript errors to 'INT:sa_v",
    sampleDescription:
      "Detected an unexpected increase of JavaScript errors to 42%",
    defaultBounds: [50, 20, 10, 5],
  },
  {
    id: "error_rate_crash_rate",
    label: "Error rate -- crash rate",
    pattern: "DATA 'increase of crash rate to 'INT:sa_v",
    sampleDescription: "Detected an increase of crash rate to 42%",
    defaultBounds: [50, 20, 10, 5],
  },
  {
    id: "error_rate_error_rate_to",
    label: 'Error rate -- "increase of error rate to"',
    pattern: "DATA 'increase of error rate to 'INT:sa_v",
    sampleDescription: "Detected an increase of error rate to 42%",
    defaultBounds: [50, 20, 10, 5],
  },
  {
    id: "disk_cpu_usage",
    label: 'Disk / CPU usage -- "larger than"',
    pattern: "DATA 'larger than 'INT:sa_v",
    sampleDescription: "CPU usage is larger than 92%",
    defaultBounds: [95, 90, 80, 70],
  },
  {
    id: "memory_saturation",
    label: "Memory saturation",
    pattern: "DATA 'Memory saturation\\n- 'INT:sa_v",
    sampleDescription: "Memory saturation\n- 92%",
    defaultBounds: [95, 90, 80, 70],
  },
  {
    id: "slowdown_pct",
    label: "Slowdown %",
    pattern: "DATA ') by 'INT:sa_v",
    sampleDescription: "Response time degraded (slower) by 120%",
    defaultBounds: [500, 200, 50, 20],
  },
];

/** Sentinel Select option value for "write your own DPL", distinct from every real preset id. */
export const CUSTOM_PATTERN_ID = "__custom__";

/** Reverse-matches a stored `parse_pattern` back to a preset id for the editor's Select --
 * verbatim match only, falling back to "Custom" (with the raw pattern shown) otherwise. */
export function findPresetForPattern(pattern: string | null): string {
  if (!pattern) return CUSTOM_PATTERN_ID;
  const found = THRESHOLD_PATTERN_PRESETS.find((p) => p.pattern === pattern);
  return found ? found.id : CUSTOM_PATTERN_ID;
}

export type ThresholdBoundsInput = [string, string, string, string];

export const EMPTY_THRESHOLD_BOUNDS: ThresholdBoundsInput = ["", "", "", ""];

/** Parses the stored `threshold_bounds` string (docs/03's "50,20,10,5" format) into the four
 * controlled number-input strings used while editing. */
export function parseThresholdBoundsInput(
  stored: string | null,
): ThresholdBoundsInput {
  if (!stored) return EMPTY_THRESHOLD_BOUNDS;
  const parts = stored.split(",").map((s) => s.trim());
  return [parts[0] ?? "", parts[1] ?? "", parts[2] ?? "", parts[3] ?? ""];
}

/** Joins the four number inputs back into the exact comma-separated format `validateRule`
 * expects (docs/03: "Four descending numbers, comma-separated, e.g. \"50,20,10,5\""). */
export function formatThresholdBoundsInput(
  bounds: ThresholdBoundsInput,
): string {
  return bounds.join(",");
}

/** Client-side mirror of the compiler-level strictly-descending check (validateRule.ts), so the
 * editor can show immediate feedback rather than waiting for a post-submit rejection. Returns
 * false (not descending / invalid) whenever any slot is blank or non-numeric, same as the
 * server-side check treating that as invalid. */
export function thresholdBoundsAreDescending(
  bounds: ThresholdBoundsInput,
): boolean {
  if (bounds.some((b) => b === "" || Number.isNaN(Number(b)))) return false;
  const nums = bounds.map(Number);
  for (let i = 1; i < nums.length; i++) {
    if (!(nums[i] < nums[i - 1])) return false;
  }
  return true;
}

const THRESHOLD_SEVERITY_LABELS = [
  "Critical (1)",
  "High (2)",
  "Medium (3)",
  "Low (4)",
] as const;

/**
 * The threshold section of the rule editor (docs/05-ui-spec.md "Threshold section"): a pattern
 * picker (seeded presets or custom DPL) plus four plain number inputs for the descending
 * boundaries. Deliberately not the draggable visual threshold bar or "paste a sample, click the
 * number" generator from the spec -- those are polish; four number inputs are the intended v1,
 * matching the level of polish of the existing `SeverityPicker` elsewhere in this codebase.
 */
export function ThresholdEditor(props: {
  /** The rule's event name, so suggestions can be scoped to it. */
  eventName: string | null;
  patternPresetId: string;
  setPatternPresetId: (id: string) => void;
  parsePattern: string;
  setParsePattern: (v: string) => void;
  bounds: ThresholdBoundsInput;
  setBounds: (b: ThresholdBoundsInput) => void;
}) {
  const {
    eventName,
    patternPresetId,
    setPatternPresetId,
    parsePattern,
    setParsePattern,
    bounds,
    setBounds,
  } = props;

  const selectedPreset = THRESHOLD_PATTERN_PRESETS.find(
    (p) => p.id === patternPresetId,
  );
  const descending = thresholdBoundsAreDescending(bounds);
  const anyFilledIn = bounds.some((b) => b !== "");

  const onSelectPreset = (id: string) => {
    setPatternPresetId(id);
    if (id === CUSTOM_PATTERN_ID) return;
    const preset = THRESHOLD_PATTERN_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setParsePattern(preset.pattern);
    // Only seed the boundary inputs the first time a preset is picked -- never clobber values
    // the user already typed (e.g. when switching presets after adjusting bounds).
    if (bounds.every((b) => b === "")) {
      setBounds(preset.defaultBounds.map(String) as ThresholdBoundsInput);
    }
  };

  const setBoundAt = (i: number, v: number | null) => {
    const next = [...bounds] as ThresholdBoundsInput;
    next[i] = v === null ? "" : String(v);
    setBounds(next);
  };

  return (
    <Flex flexDirection="column" gap={16}>
      <Flex flexDirection="column" gap={2}>
        <Paragraph>Number pattern</Paragraph>
        <Select
          value={patternPresetId}
          onChange={(v) => v && onSelectPreset(v)}
        >
          <Select.Trigger width="full" />
          <Select.Content width="trigger">
            {THRESHOLD_PATTERN_PRESETS.map((p) => (
              <Select.Option key={p.id} value={p.id}>
                {p.label}
              </Select.Option>
            ))}
            <Select.Option value={CUSTOM_PATTERN_ID}>
              Custom (write your own DPL)
            </Select.Option>
          </Select.Content>
        </Select>
        {selectedPreset && (
          <Hint>Sample: &quot;{selectedPreset.sampleDescription}&quot;</Hint>
        )}
      </Flex>

      <PatternSuggestions
        eventName={eventName}
        onPick={(pattern) => {
          setPatternPresetId(CUSTOM_PATTERN_ID);
          setParsePattern(pattern);
        }}
      />

      {/* The pattern is always visible, not only in Custom mode: it is what the compiler actually
          parses with, and seeing a working one is the best starting point for writing your own. */}
      <Flex flexDirection="column" gap={2}>
        <Paragraph>
          DPL pattern
          {patternPresetId === CUSTOM_PATTERN_ID ? "" : " (from the preset)"}
        </Paragraph>
        <TextInput
          value={parsePattern}
          onChange={setParsePattern}
          disabled={patternPresetId !== CUSTOM_PATTERN_ID}
          placeholder="DATA 'increase of error rate to 'INT:sa_v"
        />
        {patternPresetId === CUSTOM_PATTERN_ID ? (
          <Hint>
            Must capture the number into a field named exactly &quot;sa_v&quot;
            (e.g. &quot;INT:sa_v&quot;) -- the compiler builds its threshold
            chain off that fixed name. Everything before it is matched
            literally, so it must appear verbatim in the event description.
          </Hint>
        ) : (
          <Hint>
            This is the pattern the app will compile:{" "}
            <code>parse event.description, &quot;{parsePattern}&quot;</code>.
            Pick &quot;Custom&quot; to edit it -- the field keeps this text, so
            you can use it as a starting point.
          </Hint>
        )}
      </Flex>

      <Flex flexDirection="column" gap={8}>
        <Paragraph>Severity by value</Paragraph>
        <Flex gap={12} flexFlow="wrap">
          {THRESHOLD_SEVERITY_LABELS.map((label, i) => (
            <Flex
              key={label}
              flexDirection="column"
              gap={2}
              style={{ minWidth: 160 }}
            >
              <Paragraph>&ge; this value &rarr; {label}</Paragraph>
              <NumberInput
                value={bounds[i] === "" ? null : Number(bounds[i])}
                onChange={(v) => setBoundAt(i, v)}
              />
            </Flex>
          ))}
        </Flex>
        <Hint>
          Below all four values &rarr; Informational (5). Values must be
          strictly descending.
        </Hint>
        {anyFilledIn && !descending && (
          <ErrorLine message="Boundaries must be strictly descending (e.g. 50, 20, 10, 5) and all four must be filled in." />
        )}
      </Flex>
    </Flex>
  );
}

export function useSaveHandler(persist: (next: Rule[]) => Promise<void>) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const run = async (next: Rule[]) => {
    setSaveState("saving");
    setSaveError(null);
    try {
      await persist(next);
      setSaveState("idle");
      return true;
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  return { saveState, saveError, run };
}
