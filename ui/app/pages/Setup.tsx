import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Select, TextInput } from "@dynatrace/strato-components/forms";
import { Button } from "@dynatrace/strato-components/buttons";

import { ObserveWarning } from "../components/ObserveWarning";
import { MatcherField } from "../components/MatcherField";
import { firstRunRegistry, needsSetup } from "../lib/config/firstRun";
import { useRegistry, useSaveRegistry } from "../lib/config/useRegistry";
import { validateRegistry } from "../lib/config/validateRegistry";
import { isProbeableField } from "../lib/queries/fillRate";
import { useFillRates } from "../lib/queries/useFillRates";
import type { RoleRegistry } from "../lib/types/registry";

const STEPS = ["Welcome", "Labels", "Events", "Done"] as const;

/**
 * First-run setup, and "run setup again" from Help. Three short steps over the settings that must
 * exist before rules can: which tenant field holds each label, which events the default profile
 * takes, and what to do with the rest. Everything is prefilled from what is stored, so re-running
 * it shows the current values and never resets them. Skipping is always possible: nothing here is
 * required to use the app, and the rest of the app says what is missing instead of failing.
 */
export const Setup = () => {
  const navigate = useNavigate();
  const { registry: saved, isLoading } = useRegistry();
  const save = useSaveRegistry();
  const [draft, setDraft] = useState<RoleRegistry | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draft !== null || saved === null) return;
    if (!needsSetup(saved)) {
      setDraft(saved);
      return;
    }
    // Nothing usable stored yet: suggest the built-in labels, and observe mode for a first install.
    const base = firstRunRegistry();
    setDraft({ ...saved, roles: base.roles, writeMode: "observe" });
  }, [saved, draft]);

  const fill = useFillRates(draft?.roles.map((r) => r.field) ?? []);
  const issues = useMemo(() => (draft ? validateRegistry(draft) : []), [draft]);

  if (isLoading || draft === null) {
    return (
      <Flex flexDirection="column" padding={32}>
        <Paragraph>Loading...</Paragraph>
      </Flex>
    );
  }

  const update = (patch: Partial<RoleRegistry>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const saveAndNext = async () => {
    if (issues.length > 0) {
      setError(issues[0].message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await save(draft);
      setStep((s) => s + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const rate = (field: string): string => {
    const f = field.trim();
    if (f === "") return "";
    if (!isProbeableField(f)) return "no live stats for this field";
    if (fill.isLoading) return "checking...";
    const r = fill.rates[f];
    return r === undefined ? "" : `${Math.round(r * 100)}% of recent events`;
  };

  return (
    <Flex
      flexDirection="column"
      padding={32}
      gap={24}
      style={{ maxWidth: 900 }}
    >
      <Flex flexDirection="column" gap={4}>
        <Heading level={2}>Setup</Heading>
        <Text>
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </Text>
      </Flex>

      {step === 0 && (
        <Surface padding={24}>
          <Flex flexDirection="column" gap={12}>
            <Heading level={3}>Severity from rules, in business terms</Heading>
            <Paragraph>
              You say how severe an event is, optionally depending on who owns
              it (a business unit, an application, a tier). The app writes and
              maintains the OpenPipeline that applies it.
            </Paragraph>
            <Paragraph>
              <Strong>Nothing changes in your tenant during setup.</Strong>{" "}
              Settings are saved in the app; events are touched only after you
              publish and turn the route on.
            </Paragraph>
            <Flex gap={8}>
              <Button variant="accent" onClick={() => setStep(1)}>
                Start
              </Button>
              <Button variant="emphasized" onClick={() => navigate("/help")}>
                Read how it works first
              </Button>
              <Button variant="emphasized" onClick={() => navigate("/rules")}>
                Skip for now
              </Button>
            </Flex>
          </Flex>
        </Surface>
      )}

      {step === 1 && (
        <Surface padding={24}>
          <Flex flexDirection="column" gap={16}>
            <Heading level={3}>Which fields hold your labels?</Heading>
            <Paragraph>
              Rules match on labels such as Business Unit or Tier. Tell the app
              which tenant field or tag holds each one. The suggestions are
              common defaults: change any that differ in your tenant. Leave a
              field empty to switch that label off.
            </Paragraph>
            {draft.roles.map((role, i) => (
              <Flex
                key={role.role}
                gap={16}
                alignItems="flex-end"
                flexWrap="wrap"
              >
                <Flex flexDirection="column" gap={2} style={{ width: 180 }}>
                  <Paragraph>Label</Paragraph>
                  <Strong>{role.label}</Strong>
                </Flex>
                <Flex flexDirection="column" gap={2} style={{ minWidth: 260 }}>
                  <Paragraph>Field or tag</Paragraph>
                  <TextInput
                    value={role.field}
                    placeholder="primary_tags.bu"
                    onChange={(value) =>
                      update({
                        roles: draft.roles.map((r, j) =>
                          j === i
                            ? {
                                ...r,
                                field: value,
                                enabled: value.trim() !== "",
                              }
                            : r,
                        ),
                      })
                    }
                  />
                </Flex>
                <Text>{rate(role.field)}</Text>
              </Flex>
            ))}
            <Text>
              A low percentage means most events do not carry that field, so
              rules on it will rarely match. You can add your own labels later
              in Settings.
            </Text>
            {error && <Paragraph>{error}</Paragraph>}
            <Flex gap={8}>
              <Button variant="emphasized" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button
                variant="accent"
                disabled={saving}
                onClick={() => void saveAndNext()}
              >
                {saving ? "Saving..." : "Save and continue"}
              </Button>
              <Button variant="emphasized" onClick={() => navigate("/rules")}>
                Skip for now
              </Button>
            </Flex>
          </Flex>
        </Surface>
      )}

      {step === 2 && (
        <Surface padding={24}>
          <Flex flexDirection="column" gap={20}>
            <Heading level={3}>Which events, and what happens to them?</Heading>
            <Paragraph>
              This is for your default set of rules. If a team needs its own
              severities later, add it on the Teams screen (the Profiles tab);
              everyone else keeps using this one.
            </Paragraph>
            <MatcherField
              value={draft.routeMatcher}
              onChange={(routeMatcher) => update({ routeMatcher })}
            />
            <Flex flexDirection="column" gap={2} style={{ maxWidth: 420 }}>
              <Paragraph>What it does to events</Paragraph>
              <Select
                value={draft.writeMode ?? "live"}
                onChange={(v) => v && update({ writeMode: v })}
              >
                <Select.Content>
                  <Select.Option value="observe">
                    Observe first: record what it would set (recommended)
                  </Select.Option>
                  <Select.Option value="live">
                    Live: set event.severity
                  </Select.Option>
                </Select.Content>
              </Select>
              <Text>
                Observe lets you compare the proposed severities on the Results
                screen before anything real changes. You can switch to live
                later.
              </Text>
              {draft.writeMode === "observe" && <ObserveWarning />}
            </Flex>
            <Flex flexDirection="column" gap={2} style={{ maxWidth: 420 }}>
              <Paragraph>Events with no rule</Paragraph>
              <Select
                value={draft.defaultSeverity.mode === "leave" ? "leave" : "set"}
                onChange={(v) =>
                  v &&
                  update({
                    defaultSeverity:
                      v === "leave"
                        ? { mode: "leave" }
                        : {
                            mode: "flag",
                            value: draft.defaultSeverity.value ?? "3",
                          },
                  })
                }
              >
                <Select.Content>
                  <Select.Option value="leave">
                    Leave their severity as it is (recommended)
                  </Select.Option>
                  <Select.Option value="set">
                    Give them a severity, and flag them
                  </Select.Option>
                </Select.Content>
              </Select>
              {draft.defaultSeverity.mode !== "leave" && (
                <TextInput
                  value={draft.defaultSeverity.value ?? ""}
                  placeholder="Severity 1-5"
                  onChange={(value) =>
                    update({ defaultSeverity: { mode: "flag", value } })
                  }
                />
              )}
            </Flex>
            {error && <Paragraph>{error}</Paragraph>}
            <Flex gap={8}>
              <Button variant="emphasized" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                variant="accent"
                disabled={saving}
                onClick={() => void saveAndNext()}
              >
                {saving ? "Saving..." : "Save and finish"}
              </Button>
            </Flex>
          </Flex>
        </Surface>
      )}

      {step === 3 && (
        <Surface padding={24}>
          <Flex flexDirection="column" gap={12}>
            <Heading level={3}>Setup saved</Heading>
            <Paragraph>
              Next, add a default severity for the events you care about most.
              Nothing reaches an event until you publish and enable the route.
              You can change any of this later in Settings or on the Teams
              screen, and run this setup again from Help.
            </Paragraph>
            <Flex>
              <Button variant="accent" onClick={() => navigate("/rules")}>
                Go to Rules
              </Button>
            </Flex>
          </Flex>
        </Surface>
      )}
    </Flex>
  );
};
