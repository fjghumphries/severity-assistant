import React, { useMemo, useState } from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import {
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Select, TextInput } from "@dynatrace/strato-components/forms";
import { Button } from "@dynatrace/strato-components/buttons";
import { Modal } from "@dynatrace/strato-components/overlays";

import { matcherProblems } from "../../lib/compiler/syntax";
import { newProfile } from "../../lib/config/profiles";
import type { Profile, RoleRegistry } from "../../lib/types/registry";

interface Props {
  /** The registry including the profiles drafted so far, so a new id never collides. */
  registry: RoleRegistry;
  /** Stores the profile; rejects with the reason if it could not be saved. */
  onCreate: (profile: Profile) => Promise<void>;
  onClose: () => void;
}

type Take = "label" | "custom";

const STEPS = ["Name", "Which events", "Review"];

const quote = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/**
 * Creating a profile as three short steps in a dialog, so nothing is left to find at the bottom of
 * a page: a name, which events the profile takes (the one field that must be right, so it is built
 * from a label and a value rather than typed), and what to do when no rule matches. Everything
 * else (security context) keeps its safe default and is editable afterwards.
 *
 * Mounted only while open, so its state starts fresh each time.
 */
export const NewProfileWizard = ({ registry, onCreate, onClose }: Props) => {
  const roles = registry.roles.filter(
    (r) => r.enabled && r.cardinality === "single",
  );
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [take, setTake] = useState<Take>(roles.length > 0 ? "label" : "custom");
  const [roleId, setRoleId] = useState<string | null>(roles[0]?.role ?? null);
  const [value, setValue] = useState("");
  const [custom, setCustom] = useState("");
  const [fallback, setFallback] = useState<"leave" | "set">("leave");
  const [fallbackValue, setFallbackValue] = useState("3");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const role = roles.find((r) => r.role === roleId) ?? null;
  const matcher =
    take === "label"
      ? role && value.trim()
        ? `matchesValue(${role.field}, "${quote(value.trim())}")`
        : ""
      : custom.trim();
  const problems = useMemo(
    () => (matcher ? matcherProblems(matcher) : []),
    [matcher],
  );

  const stepOk =
    step === 0
      ? name.trim() !== ""
      : step === 1
        ? matcher !== "" && problems.length === 0
        : fallback === "leave" || /^[1-5]$/.test(fallbackValue);

  const create = () => {
    const base = newProfile(name, registry);
    const profile: Profile = {
      ...base,
      routeMatcher: matcher,
      defaultSeverity:
        fallback === "leave"
          ? { mode: "leave" }
          : { mode: "set", value: fallbackValue },
    };
    setState("saving");
    setError(null);
    onCreate(profile)
      .then(onClose)
      .catch((e: Error) => {
        setState("error");
        setError(e.message);
      });
  };

  return (
    <Modal
      title="New profile"
      show
      size="medium"
      onDismiss={onClose}
      footer={
        <Flex alignItems="center" gap={12}>
          {step < 2 ? (
            <Button
              variant="accent"
              disabled={!stepOk}
              onClick={() => setStep(step + 1)}
            >
              Next
            </Button>
          ) : (
            <Button
              variant="accent"
              disabled={!stepOk || state === "saving"}
              onClick={create}
            >
              {state === "saving" ? "Creating..." : "Create profile"}
            </Button>
          )}
          {step > 0 && (
            <Button variant="emphasized" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button variant="emphasized" onClick={onClose}>
            Cancel
          </Button>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={24}>
        <Text>
          Step {step + 1} of {STEPS.length}: <Strong>{STEPS[step]}</Strong>
        </Text>

        {step === 0 && (
          <Flex flexDirection="column" gap={8}>
            <Paragraph>What is this profile for?</Paragraph>
            <TextInput
              value={name}
              placeholder="e.g. Team Alpha"
              onChange={setName}
            />
            <Text>
              A profile is its own set of severity rules, with its own pipeline
              and route. Everyone else keeps the current behaviour.
            </Text>
          </Flex>
        )}

        {step === 1 && (
          <Flex flexDirection="column" gap={16}>
            <Paragraph>Which Davis events should it take?</Paragraph>
            <Select value={take} onChange={(v) => v && setTake(v)}>
              <Select.Content>
                {roles.length > 0 && (
                  <Select.Option value="label">
                    Events with a certain label value
                  </Select.Option>
                )}
                <Select.Option value="custom">
                  A custom matcher (advanced)
                </Select.Option>
              </Select.Content>
            </Select>

            {take === "label" ? (
              <Flex gap={12} flexWrap="wrap" alignItems="flex-end">
                <Flex flexDirection="column" gap={2} style={{ minWidth: 200 }}>
                  <Paragraph>Label</Paragraph>
                  <Select value={roleId} onChange={(v) => setRoleId(v ?? null)}>
                    <Select.Content>
                      {roles.map((r) => (
                        <Select.Option key={r.role} value={r.role}>
                          {r.label}
                        </Select.Option>
                      ))}
                    </Select.Content>
                  </Select>
                </Flex>
                <Flex flexDirection="column" gap={2} style={{ minWidth: 200 }}>
                  <Paragraph>Equals</Paragraph>
                  <TextInput
                    value={value}
                    placeholder="e.g. bu1"
                    onChange={setValue}
                  />
                </Flex>
              </Flex>
            ) : (
              <Flex flexDirection="column" gap={2}>
                <TextInput
                  value={custom}
                  placeholder='matchesValue(primary_tags.bu, "bu1")'
                  onChange={setCustom}
                />
                <Text>
                  Allowed functions: matchesValue, matchesPhrase, isNull,
                  isNotNull.
                </Text>
              </Flex>
            )}

            {matcher && (
              <Text>
                Matcher: <code>{matcher}</code>
              </Text>
            )}
            {problems.map((p, i) => (
              <Text key={i}>{p}</Text>
            ))}
            <Text>
              Routing is first match wins, so this profile only receives events
              that no enabled route above it already took.
            </Text>
          </Flex>
        )}

        {step === 2 && (
          <Flex flexDirection="column" gap={16}>
            <Paragraph>Events with no rule</Paragraph>
            <Flex gap={12} flexWrap="wrap" alignItems="flex-end">
              <Select value={fallback} onChange={(v) => v && setFallback(v)}>
                <Select.Content>
                  <Select.Option value="leave">
                    Leave its severity untouched
                  </Select.Option>
                  <Select.Option value="set">
                    Set a default severity
                  </Select.Option>
                </Select.Content>
              </Select>
              {fallback === "set" && (
                <Flex flexDirection="column" gap={2} style={{ width: 120 }}>
                  <Paragraph>Severity (1-5)</Paragraph>
                  <TextInput
                    value={fallbackValue}
                    onChange={setFallbackValue}
                  />
                </Flex>
              )}
            </Flex>

            <Flex flexDirection="column" gap={4}>
              <Text>
                <Strong>Name:</Strong> {name.trim()}
              </Text>
              <Text>
                <Strong>Takes:</Strong> <code>{matcher}</code>
              </Text>
              <Text>
                Nothing is deployed or routed yet. Add rules, then deploy and
                enable the route from the Pipeline step.
              </Text>
            </Flex>
            {state === "error" && error && <Text>{error}</Text>}
          </Flex>
        )}
      </Flex>
    </Modal>
  );
};
