import React, { useMemo, useState } from "react";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Strong,
} from "@dynatrace/strato-components/typography";
import { Select, TextInput } from "@dynatrace/strato-components/forms";
import { Button } from "@dynatrace/strato-components/buttons";
import { Modal } from "@dynatrace/strato-components/overlays";

import { explain } from "../../lib/explain/explain";
import { labelValueOptions } from "../../lib/explain/values";
import type { DiscoveryRow } from "../../lib/types/discovery";
import type { EventCatalogueEntry } from "../../lib/queries/derive";
import type { AnomalyDetectorOption } from "../../lib/queries/useAnomalyDetectors";
import type { RoleRegistry } from "../../lib/types/registry";
import type { Rule } from "../../lib/types/rule";
import { severityText } from "../../components/SeverityBadge";
import { usableRoles } from "./shared";

interface Props {
  rules: Rule[];
  registry: RoleRegistry;
  eventCatalogue: EventCatalogueEntry[];
  discoveryRows: DiscoveryRow[];
  detectors: AnomalyDetectorOption[];
  onClose: () => void;
}

const NO_PICK = "__none__";
const OTHER = "__other__";
const NOT_SET = "__notset__";

/**
 * "Explain this event": pick an event or detector and type the label values it carries; the app
 * says which rule wins, which others matched or missed and why. A way to check behaviour without
 * reading the pipeline. Pure evaluation lives in `lib/explain`.
 */
export const ExplainModal = ({
  rules,
  registry,
  eventCatalogue,
  discoveryRows,
  detectors,
  onClose,
}: Props) => {
  const roles = usableRoles(registry);
  const [mode, setMode] = useState<"event" | "detector">("event");
  const [eventName, setEventName] = useState("");
  const [detectorId, setDetectorId] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});

  const valueOptions = useMemo(
    () =>
      labelValueOptions(
        discoveryRows,
        rules,
        registry,
        roles.map((r) => r.role),
        mode === "event" && eventName !== "" ? eventName : null,
      ),
    [discoveryRows, rules, registry, roles, mode, eventName],
  );
  // Labels the user chose to type a value for, instead of picking one.
  const [typing, setTyping] = useState<Record<string, boolean>>({});

  const ready = mode === "event" ? eventName !== "" : detectorId !== null;
  const result = useMemo(
    () =>
      ready
        ? explain(rules, registry, {
            eventName: mode === "event" ? eventName : "",
            detectorId: mode === "detector" ? detectorId : null,
            labels,
          })
        : null,
    [ready, rules, registry, mode, eventName, detectorId, labels],
  );

  return (
    <Modal
      title="Explain this event"
      show
      size="large"
      onDismiss={onClose}
      footer={
        <Button variant="emphasized" onClick={onClose}>
          Close
        </Button>
      }
    >
      <Flex flexDirection="column" gap={20}>
        <Paragraph style={{ maxWidth: 720 }}>
          Describe an event and the label values it carries, and see which rule
          decides its severity. Leave a label blank to mean it is not set on the
          event.
        </Paragraph>

        <Flex gap={16} flexWrap="wrap" alignItems="flex-end">
          <Flex flexDirection="column" gap={2} style={{ minWidth: 180 }}>
            <Paragraph>The event is identified by</Paragraph>
            <Select value={mode} onChange={(v) => v && setMode(v)}>
              <Select.Content>
                <Select.Option value="event">Event name</Select.Option>
                <Select.Option value="detector">Anomaly detector</Select.Option>
              </Select.Content>
            </Select>
          </Flex>
          {mode === "event" ? (
            <Flex flexDirection="column" gap={2} style={{ minWidth: 320 }}>
              <Paragraph>Event name (exact)</Paragraph>
              <TextInput
                value={eventName}
                onChange={setEventName}
                placeholder="e.g. CPU saturation"
              />
              {eventCatalogue.length > 0 && (
                <Select
                  value={NO_PICK}
                  onChange={(v) => v && v !== NO_PICK && setEventName(v)}
                >
                  <Select.Content>
                    <Select.Option value={NO_PICK}>
                      ...or pick one seen in the last 2 hours
                    </Select.Option>
                    {eventCatalogue.slice(0, 50).map((e) => (
                      <Select.Option key={e.eventName} value={e.eventName}>
                        {e.eventName}
                      </Select.Option>
                    ))}
                  </Select.Content>
                </Select>
              )}
            </Flex>
          ) : (
            <Flex flexDirection="column" gap={2} style={{ minWidth: 320 }}>
              <Paragraph>Anomaly detector</Paragraph>
              <Select
                value={detectorId ?? NO_PICK}
                onChange={(v) => setDetectorId(v && v !== NO_PICK ? v : null)}
              >
                <Select.Content>
                  <Select.Option value={NO_PICK}>
                    Choose a detector
                  </Select.Option>
                  {detectors.map((d) => (
                    <Select.Option key={d.objectId} value={d.objectId}>
                      {d.name}
                    </Select.Option>
                  ))}
                </Select.Content>
              </Select>
            </Flex>
          )}
        </Flex>

        {roles.length === 0 ? (
          <Paragraph>
            No labels are set up yet, so only defaults can apply.
          </Paragraph>
        ) : (
          <Flex gap={16} flexWrap="wrap">
            {roles.map((r) => (
              <Flex
                key={r.role}
                flexDirection="column"
                gap={2}
                style={{ minWidth: 180 }}
              >
                <Paragraph>{r.label}</Paragraph>
                {(() => {
                  const opts = valueOptions[r.role] ?? [];
                  const current = labels[r.role] ?? "";
                  const known = opts.some((o) => o.value === current);
                  const showText =
                    typing[r.role] ||
                    opts.length === 0 ||
                    (current !== "" && !known);
                  const selectValue = showText
                    ? OTHER
                    : current === ""
                      ? NOT_SET
                      : current;
                  return (
                    <>
                      {opts.length > 0 && (
                        <Select
                          value={selectValue}
                          onChange={(v) => {
                            if (!v) return;
                            if (v === OTHER) {
                              setTyping((p) => ({ ...p, [r.role]: true }));
                              return;
                            }
                            setTyping((p) => ({ ...p, [r.role]: false }));
                            setLabels((p) => ({
                              ...p,
                              [r.role]: v === NOT_SET ? "" : v,
                            }));
                          }}
                        >
                          <Select.Content>
                            <Select.Option value={NOT_SET}>
                              (not set)
                            </Select.Option>
                            {opts.map((o) => (
                              <Select.Option key={o.value} value={o.value}>
                                {o.count > 0
                                  ? `${o.value} (${o.count})`
                                  : `${o.value} (used by a rule)`}
                              </Select.Option>
                            ))}
                            <Select.Option value={OTHER}>
                              Other (type a value)...
                            </Select.Option>
                          </Select.Content>
                        </Select>
                      )}
                      {showText && (
                        <TextInput
                          value={current}
                          onChange={(v) =>
                            setLabels((p) => ({ ...p, [r.role]: v }))
                          }
                          placeholder="(not set)"
                        />
                      )}
                    </>
                  );
                })()}
              </Flex>
            ))}
          </Flex>
        )}

        {result ? (
          <Surface padding={20}>
            <Flex flexDirection="column" gap={12}>
              <Heading level={4}>{result.summary}</Heading>
              {result.severity !== null && (
                <Paragraph>
                  Result: <Strong>{severityText(result.severity)}</Strong>
                </Paragraph>
              )}
              {result.default && (
                <Paragraph>
                  Default: &quot;{result.default.rule.name}&quot; gives{" "}
                  {severityText(result.default.rule.severity)}.
                </Paragraph>
              )}
              {result.exceptions.length > 0 && (
                <Flex flexDirection="column" gap={4}>
                  <Strong>
                    Exceptions for this event (last match wins, in this order)
                  </Strong>
                  {result.exceptions.map((l) => (
                    <Paragraph key={l.rule.rule_id}>
                      {l.matches ? "✔" : "✘"} &quot;{l.rule.name}&quot;
                      (severity {l.rule.severity}):{" "}
                      {l.matches ? "matches, " : "does not match, "}
                      {l.reason}
                      {result.winner?.rule_id === l.rule.rule_id
                        ? ". This one wins"
                        : ""}
                    </Paragraph>
                  ))}
                </Flex>
              )}
              {result.undecided.length > 0 && (
                <Paragraph>
                  <Strong>Could not be decided here:</Strong>{" "}
                  {result.undecided.map((r) => `"${r.name}"`).join(", ")} read a
                  number from the event text, which this check does not have.
                  The real severity may be different if{" "}
                  {result.undecided.length === 1 ? "it applies" : "they apply"}.
                </Paragraph>
              )}
            </Flex>
          </Surface>
        ) : (
          <Paragraph>Choose an event to see the result.</Paragraph>
        )}
      </Flex>
    </Modal>
  );
};
