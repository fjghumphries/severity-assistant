import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUserDetails } from "@dynatrace-sdk/app-environment";

import { Flex } from "@dynatrace/strato-components/layouts";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { TextInput } from "@dynatrace/strato-components/forms";
import { Button } from "@dynatrace/strato-components/buttons";
import { Modal } from "@dynatrace/strato-components/overlays";

import {
  buildCandidate,
  type FormValues,
  type RuleKind,
} from "../../lib/rules/candidate";
import type { EventCatalogueEntry } from "../../lib/queries/derive";
import type { AnomalyDetectorOption } from "../../lib/queries/useAnomalyDetectors";
import type { RoleRegistry } from "../../lib/types/registry";
import {
  getConditions,
  type Rule,
  type RuleCondition,
  type RuleType,
} from "../../lib/types/rule";
import {
  ConditionRow,
  conditionsSummary,
  usableRoles,
  CUSTOM_PATTERN_ID,
  deriveRuleName,
  EMPTY_THRESHOLD_BOUNDS,
  ErrorLine,
  findPresetForPattern,
  formatThresholdBoundsInput,
  type MatchMode,
  parseThresholdBoundsInput,
  RuleTypePicker,
  SeverityPicker,
  TargetPicker,
  type ThresholdBoundsInput,
  ThresholdEditor,
  useSaveHandler,
} from "./shared";

const emptyCondition = (): RuleCondition => ({ role: null, value: "" });

/** What the editor opens on. `target` pre-fills a new rule, e.g. "add an exception to this event". */
export interface EditorRequest {
  kind: RuleKind;
  /** The rule being edited, or null to add. */
  editing: Rule | null;
  target?: { eventName?: string; detectorId?: string };
}

interface Props {
  request: EditorRequest;
  rules: Rule[];
  registry: RoleRegistry;
  eventCatalogue: EventCatalogueEntry[];
  detectors: AnomalyDetectorOption[];
  detectorName: (id: string) => string;
  persist: (next: Rule[]) => Promise<void>;
  onClose: () => void;
}

/**
 * One editor for both kinds of rule. A system-wide default and a label-based exception differ in
 * only two ways -- the exception has label conditions, and takes a place in the exception order --
 * so the form is shared and `kind` switches those two things.
 *
 * Mounted only while open (the parent renders it conditionally), so its state initialises from the
 * request each time instead of needing to be reset.
 */
export const RuleEditorModal = ({
  request,
  rules,
  registry,
  eventCatalogue,
  detectors,
  detectorName,
  persist,
  onClose,
}: Props) => {
  const navigate = useNavigate();
  const { kind, editing, target } = request;
  const isDefault = kind === "default";

  const [name, setName] = useState(editing?.name ?? "");
  const [matchMode, setMatchMode] = useState<MatchMode>(
    editing
      ? editing.detector_id !== null
        ? "detector"
        : "event"
      : target?.detectorId
        ? "detector"
        : "event",
  );
  const [eventName, setEventName] = useState(
    editing?.event_name ?? target?.eventName ?? "",
  );
  const [detectorId, setDetectorId] = useState<string | null>(
    editing?.detector_id ?? target?.detectorId ?? null,
  );
  const [ruleType, setRuleType] = useState<RuleType>(
    editing?.rule_type ?? "keyed",
  );
  const [severity, setSeverity] = useState(editing?.severity ?? "3");
  const [patternPresetId, setPatternPresetId] = useState<string>(
    editing?.rule_type === "threshold"
      ? findPresetForPattern(editing.parse_pattern)
      : CUSTOM_PATTERN_ID,
  );
  const [parsePattern, setParsePattern] = useState(
    editing?.parse_pattern ?? "",
  );
  const [thresholdBounds, setThresholdBounds] = useState<ThresholdBoundsInput>(
    editing?.rule_type === "threshold"
      ? parseThresholdBoundsInput(editing.threshold_bounds)
      : EMPTY_THRESHOLD_BOUNDS,
  );
  const [conditions, setConditions] = useState<RuleCondition[]>(() => {
    const existing = editing
      ? getConditions(editing).filter((c) => c.role !== null)
      : [];
    return existing.length > 0 ? existing : [emptyCondition()];
  });
  const [formIssues, setFormIssues] = useState<string[]>([]);

  const { saveState, saveError, run } = useSaveHandler(persist);

  // Event names another rule of this kind already targets, so the picker can flag a clash before
  // the save is refused. Only defaults are unique per target; exceptions may share one.
  const usedEventNames = useMemo(
    () =>
      isDefault
        ? new Set(
            rules
              .filter(
                (r) =>
                  r.rule_id !== editing?.rule_id &&
                  r.event_name !== null &&
                  r.md1_role === null,
              )
              .map((r) => r.event_name as string),
          )
        : new Set<string>(),
    [rules, editing, isDefault],
  );

  const submit = async () => {
    const values: FormValues = {
      kind,
      name,
      matchMode,
      eventName,
      detectorId,
      ruleType,
      severity,
      parsePattern,
      thresholdBounds: formatThresholdBoundsInput(thresholdBounds),
      conditions,
    };
    const result = buildCandidate({
      values,
      base: editing ?? undefined,
      rules,
      registry,
      deriveName: ({ values: v, candidate }) =>
        deriveRuleName({
          typedName: v.name,
          matchMode: v.matchMode,
          eventName: v.eventName,
          detectorId: v.detectorId,
          detectorName,
          conditionsSummaryText: isDefault
            ? undefined
            : conditionsSummary(registry, candidate),
        }),
      now: new Date(),
      userEmail: getCurrentUserDetails().email,
    });
    if (!result.ok) {
      setFormIssues(result.issues);
      return;
    }
    if (await run(result.next)) onClose();
  };

  const noun = isDefault ? "system-wide default" : "label-based exception";

  return (
    <Modal
      title={`${editing ? "Edit" : "Add"} ${noun}`}
      show
      size="large"
      onDismiss={onClose}
      footer={
        <Flex alignItems="center" gap={12}>
          <Button
            variant="accent"
            onClick={() => void submit()}
            disabled={saveState === "saving"}
          >
            {saveState === "saving"
              ? "Saving..."
              : editing
                ? "Save changes"
                : `Add ${noun}`}
          </Button>
          <Button variant="emphasized" onClick={onClose}>
            Cancel
          </Button>
          {saveState === "error" && saveError && (
            <ErrorLine message={saveError} />
          )}
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={24}>
        <Flex flexDirection="column" gap={2}>
          <Paragraph>
            Name (optional -- defaults to the target
            {isDefault ? "" : " and conditions"})
          </Paragraph>
          <TextInput
            value={name}
            onChange={setName}
            placeholder={
              isDefault ? "(auto -- e.g. the event or detector name)" : "(auto)"
            }
          />
        </Flex>

        <TargetPicker
          matchMode={matchMode}
          setMatchMode={setMatchMode}
          eventName={eventName}
          setEventName={setEventName}
          detectorId={detectorId}
          setDetectorId={setDetectorId}
          eventCatalogue={eventCatalogue}
          detectors={detectors}
          usedEventNames={usedEventNames}
          eventNameBlankHint={
            isDefault
              ? "Required for a default -- a default always targets one event or detector."
              : "Optional -- leave blank to apply across every event, constrained only by the conditions below."
          }
        />

        {!isDefault && (
          <Flex flexDirection="column" gap={8}>
            <Paragraph>Conditions (at least one required)</Paragraph>
            {usableRoles(registry).length === 0 && (
              <Flex alignItems="center" gap={12} flexFlow="wrap">
                <Paragraph>
                  No labels are set up, so there is nothing to match on. Map and
                  save your labels in Settings first.
                </Paragraph>
                <Button
                  variant="accent"
                  onClick={() => {
                    onClose();
                    navigate("/settings");
                  }}
                >
                  Go to Settings
                </Button>
              </Flex>
            )}
            {conditions.map((c, i) => (
              <ConditionRow
                key={i}
                registry={registry}
                condition={c}
                otherUsedRoles={conditions
                  .filter((_, idx) => idx !== i)
                  .map((cc) => cc.role)
                  .filter((r): r is string => r !== null)}
                onChange={(next) =>
                  setConditions((prev) =>
                    prev.map((x, idx) => (idx === i ? next : x)),
                  )
                }
                onRemove={() =>
                  setConditions((prev) => prev.filter((_, idx) => idx !== i))
                }
              />
            ))}
            <Button
              variant="emphasized"
              onClick={() =>
                setConditions((prev) => [...prev, emptyCondition()])
              }
              disabled={conditions.length >= registry.maxConditionsPerRule}
            >
              + Add condition
            </Button>
          </Flex>
        )}

        <RuleTypePicker value={ruleType} onChange={setRuleType} />

        {ruleType === "keyed" ? (
          <Flex flexDirection="column" gap={2} style={{ maxWidth: 160 }}>
            <Paragraph>Severity</Paragraph>
            <SeverityPicker value={severity} onChange={setSeverity} />
          </Flex>
        ) : (
          <ThresholdEditor
            eventName={matchMode === "event" ? eventName : null}
            patternPresetId={patternPresetId}
            setPatternPresetId={setPatternPresetId}
            parsePattern={parsePattern}
            setParsePattern={setParsePattern}
            bounds={thresholdBounds}
            setBounds={setThresholdBounds}
          />
        )}

        {formIssues.length > 0 && (
          <Flex flexDirection="column" gap={2}>
            {formIssues.map((msg, i) => (
              <ErrorLine key={i} message={msg} />
            ))}
          </Flex>
        )}
      </Flex>
    </Modal>
  );
};
