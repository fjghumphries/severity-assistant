import React, { useEffect, useMemo, useState } from "react";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { TextInput, Switch, Select } from "@dynatrace/strato-components/forms";
import { Button } from "@dynatrace/strato-components/buttons";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { CriticalIcon } from "@dynatrace/strato-icons";

import { useFillRates } from "../lib/queries/useFillRates";
import { isProbeableField } from "../lib/queries/fillRate";
import { RoleDefinition, RoleRegistry } from "../lib/types/registry";
import { DangerZone } from "./settings/DangerZone";
import { RulesTransfer } from "./settings/RulesTransfer";
import { validateRegistry } from "../lib/config/validateRegistry";
import { useRegistry, useSaveRegistry } from "../lib/config/useRegistry";
import { labelImpact, type ProfileRules } from "../lib/config/labelImpact";
import { readAllRules } from "../lib/config/readAllRules";
import { firstRunRegistry } from "../lib/config/firstRun";
import { ObserveWarning } from "../components/ObserveWarning";
import { MatcherField } from "../components/MatcherField";
import { SaveBar } from "../components/SaveBar";
import { HelpTip, Intro } from "../components/HelpTip";
import { DEBUG_ENABLED } from "../debug/flag"; // DEBUG-HOOK
import { DebugPanel } from "../debug/DebugPanel"; // DEBUG-HOOK

/** Small subdued explanatory line under a field label. */
const Hint = ({ children }: { children: React.ReactNode }) => (
  <HelpTip>{children}</HelpTip>
);

function fillRateLabel(
  field: string,
  fill: ReturnType<typeof useFillRates>,
): string {
  const f = field.trim();
  if (f === "") return "(no field mapped)";
  if (!isProbeableField(f)) return "(live stats unavailable for this field)";
  if (fill.isLoading) return "Checking...";
  if (fill.isError) return "(could not read live stats)";
  const rate = fill.rates[f];
  return rate === undefined
    ? "(no data)"
    : `${(rate * 100).toFixed(0)}% of events in this window`;
}

export const Settings = () => {
  const { registry: saved, isLoading, isError, error, refetch } = useRegistry();
  const save = useSaveRegistry();

  const [draft, setDraft] = useState<RoleRegistry | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (draft === null && saved !== null) {
      setDraft(saved.roles.length > 0 ? saved : firstRunRegistry());
    }
  }, [saved, draft]);

  const issues = useMemo(() => (draft ? validateRegistry(draft) : []), [draft]);
  const fill = useFillRates(draft?.roles.map((r) => r.field) ?? []);

  // Every profile's rules, read once, so a change to a label can name the rules it would break.
  const [allRules, setAllRules] = useState<ProfileRules[]>([]);
  useEffect(() => {
    if (!saved || saved.roles.length === 0) return;
    let cancelled = false;
    void readAllRules(saved).then((r) => {
      if (!cancelled) setAllRules(r);
    });
    return () => {
      cancelled = true;
    };
  }, [saved]);
  const impact = useMemo(
    () => (draft && saved ? labelImpact(saved, draft, allRules) : []),
    [draft, saved, allRules],
  );

  // Compared without `profiles`: they live in the same stored object but are edited and saved on
  // the Profiles screen, so a change there is not an unsaved change here.
  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    const shared = (r: RoleRegistry) => JSON.stringify({ ...r, profiles: [] });
    return shared(draft) !== shared(saved);
  }, [draft, saved]);

  if (isLoading || draft === null) {
    return (
      <Flex flexDirection="column" padding={32} gap={32}>
        <Heading level={2}>Settings</Heading>
        <Flex alignItems="center" gap={8}>
          <ProgressCircle />
          <Paragraph>Loading role registry...</Paragraph>
        </Flex>
      </Flex>
    );
  }

  if (isError) {
    return (
      <Flex flexDirection="column" padding={32} gap={32}>
        <Heading level={2}>Settings</Heading>
        <Flex alignItems="center" gap={8}>
          <CriticalIcon />
          <Paragraph>{error ?? "Failed to load the role registry."}</Paragraph>
          <Button
            variant="emphasized"
            onClick={() => {
              void refetch();
            }}
          >
            Retry
          </Button>
        </Flex>
      </Flex>
    );
  }

  const updateRole = (index: number, patch: Partial<RoleDefinition>) => {
    setDraft((d) => {
      if (!d) return d;
      const roles = d.roles.slice();
      roles[index] = { ...roles[index], ...patch };
      return { ...d, roles };
    });
  };

  const addCustomRole = () => {
    setDraft((d) => {
      if (!d) return d;
      const newRole: RoleDefinition = {
        role: `custom_${d.roles.length + 1}`,
        label: "New role",
        field: "",
        cardinality: "single",
        enabled: true,
      };
      return { ...d, roles: [...d.roles, newRole] };
    });
  };

  const removeRole = (index: number) => {
    setDraft((d) => {
      if (!d) return d;
      return { ...d, roles: d.roles.filter((_, i) => i !== index) };
    });
  };

  const handleSave = () => {
    if (!draft || issues.length > 0) return;
    setSaveState("saving");
    setSaveError(null);
    save(draft)
      .then(() => {
        setSaveState("saved");
        void refetch();
      })
      .catch((e: Error) => {
        setSaveState("error");
        setSaveError(e.message);
      });
  };

  // Examples in the copy use the user's own labels, never fixed names.
  const labelOf = (i: number, fallback: string) =>
    draft.roles[i]?.label.trim() || fallback;
  const l0 = labelOf(0, "Label A");
  const firstField = draft.roles[0]?.field.trim() || "primary_tags.team";

  return (
    <Flex flexDirection="column" padding={32} gap={32}>
      <Heading level={2}>Settings</Heading>
      {saved && saved.roles.length === 0 && (
        <Surface padding={16}>
          <Flex flexDirection="column" gap={4}>
            <Paragraph>
              <strong>Not saved yet.</strong> The labels below are suggestions,
              not stored settings. Until you click Save, rules cannot use them:
              the rule editor will show no labels to choose from.
            </Paragraph>
          </Flex>
        </Surface>
      )}
      {impact.length > 0 && (
        <Surface padding={16}>
          <Flex flexDirection="column" gap={4}>
            <Paragraph>
              <strong>
                This change would make {impact.length}{" "}
                {impact.length === 1 ? "rule" : "rules"} invalid.
              </strong>{" "}
              Invalid rules block publishing until you edit or delete them.
              Nothing already published changes.
            </Paragraph>
            {impact.slice(0, 8).map((i) => (
              <Paragraph key={`${i.profileId}/${i.ruleId}/${i.reason}`}>
                &bull; {i.profileName}: &quot;{i.ruleName}&quot; {i.reason}
              </Paragraph>
            ))}
            {impact.length > 8 && (
              <Paragraph>...and {impact.length - 8} more.</Paragraph>
            )}
          </Flex>
        </Surface>
      )}
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Label mapping</Heading>
        <Intro
          tip={
            <>
              Labels are the business attributes your rules can match on, such
              as a team, an application or an environment. Say which tenant
              field or tag holds the value of each label; fill rate is computed
              from the last 2 hours of Davis events, so you can tell which
              fields are actually populated. For example, mapping {l0} to{" "}
              <code>{firstField}</code> lets a rule say &quot;{l0} =
              &lt;value&gt;&quot; to match events carrying that value.
            </>
          }
        >
          Map each label to the tenant field that holds its value.
        </Intro>
        {draft.roles.map((role, i) => (
          <Surface key={i} padding={20}>
            <Flex flexDirection="column" gap={12}>
              <Flex alignItems="flex-end" gap={12} flexFlow="wrap">
                <Flex flexDirection="column" gap={2} style={{ minWidth: 160 }}>
                  <Paragraph>Label</Paragraph>
                  <TextInput
                    value={role.label}
                    onChange={(value) => updateRole(i, { label: value })}
                  />
                </Flex>
                <Flex flexDirection="column" gap={2} style={{ minWidth: 220 }}>
                  <Paragraph>Field or tag</Paragraph>
                  <TextInput
                    value={role.field}
                    onChange={(value) => updateRole(i, { field: value })}
                    placeholder="primary_tags.bu"
                  />
                </Flex>
                <Flex flexDirection="column" gap={2}>
                  <Paragraph>Fill rate</Paragraph>
                  <Paragraph>{fillRateLabel(role.field, fill)}</Paragraph>
                </Flex>
              </Flex>

              <Flex
                alignItems="center"
                justifyContent="space-between"
                flexFlow="wrap"
                gap={12}
              >
                <span />

                <Flex alignItems="center" gap={12}>
                  <Switch
                    value={role.enabled}
                    onChange={(checked) => updateRole(i, { enabled: checked })}
                  >
                    Enabled
                  </Switch>
                  <Button variant="emphasized" onClick={() => removeRole(i)}>
                    Remove
                  </Button>
                </Flex>
              </Flex>
            </Flex>
          </Surface>
        ))}

        <Button variant="emphasized" onClick={addCustomRole}>
          + Add custom role
        </Button>
      </Flex>
      <Flex flexDirection="column" gap={8}>
        <Heading level={3}>Default profile settings</Heading>
        <Paragraph>
          These belong to the Default profile only: what it does when no rule
          matches, its security context, route matcher and pipeline ID. Other
          profiles keep their own on the Profiles tab. The label mapping above
          is the one part of this page shared by every profile.
        </Paragraph>
        <Flex gap={16} flexFlow="wrap">
          <Flex flexDirection="column" gap={2} style={{ minWidth: 320 }}>
            <Paragraph>What it does to events</Paragraph>
            <Select
              value={draft.writeMode ?? "live"}
              onChange={(value) =>
                value && setDraft((d) => (d ? { ...d, writeMode: value } : d))
              }
            >
              <Select.Content>
                <Select.Option value="live">
                  Live: set event.severity
                </Select.Option>
                <Select.Option value="observe">
                  Observe: only record what it would set
                </Select.Option>
              </Select.Content>
            </Select>
            <Hint>
              Observe writes sa.proposed_severity and leaves event.severity
              alone, so you can compare on the Results screen before anything
              real changes. Publish again after switching.
            </Hint>
            {draft.writeMode === "observe" && <ObserveWarning />}
          </Flex>
          <Flex flexDirection="column" gap={2} style={{ minWidth: 220 }}>
            <Paragraph>Events with no rule</Paragraph>
            <Select
              value={draft.defaultSeverity.mode}
              onChange={(value) =>
                value &&
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        defaultSeverity: {
                          mode: value,
                          value: d.defaultSeverity.value,
                        },
                      }
                    : d,
                )
              }
            >
              <Select.Content>
                <Select.Option value="leave">
                  Leave severity untouched
                </Select.Option>
                <Select.Option value="set">
                  Set a default severity
                </Select.Option>
                <Select.Option value="flag">
                  Set a default and flag it
                </Select.Option>
              </Select.Content>
            </Select>
            <Hint>
              What happens to an event that no rule covers. &quot;Leave
              untouched&quot; (recommended) keeps whatever severity Davis
              already assigned -- possibly none. &quot;Set a default&quot;
              always writes your chosen severity to uncovered events. &quot;Set
              a default and flag&quot; does the same but also marks the event so
              you can find every uncovered case later, e.g. in a Notebook query.
            </Hint>
          </Flex>

          {draft.defaultSeverity.mode !== "leave" && (
            <Flex flexDirection="column" gap={2} style={{ minWidth: 120 }}>
              <Paragraph>Default severity (1-5)</Paragraph>
              <TextInput
                value={draft.defaultSeverity.value ?? ""}
                onChange={(value) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          defaultSeverity: { ...d.defaultSeverity, value },
                        }
                      : d,
                  )
                }
              />
              <Hint>1 = Critical ... 5 = Informational.</Hint>
            </Flex>
          )}

          <Flex flexDirection="column" gap={2} style={{ minWidth: 220 }}>
            <Paragraph>Security context (dt.security_context)</Paragraph>
            <Select
              value={draft.securityContext?.mode ?? "none"}
              onChange={(value) =>
                value &&
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        securityContext: {
                          mode: value,
                          value: d.securityContext?.value,
                        },
                      }
                    : d,
                )
              }
            >
              <Select.Content>
                <Select.Option value="none">
                  Do not set (leave as is)
                </Select.Option>
                <Select.Option value="field">
                  Copy from an event field
                </Select.Option>
                <Select.Option value="constant">
                  Set a fixed value
                </Select.Option>
              </Select.Content>
            </Select>
            <Hint>
              Decides who can see these events, because IAM policies match on
              it. Leave it off unless you know your policies: changing it can
              hide events from people who see them today.
            </Hint>
          </Flex>

          {draft.securityContext && draft.securityContext.mode !== "none" && (
            <Flex flexDirection="column" gap={2} style={{ minWidth: 240 }}>
              <Paragraph>
                {draft.securityContext.mode === "field"
                  ? "Event field"
                  : "Value"}
              </Paragraph>
              <TextInput
                value={draft.securityContext.value ?? ""}
                placeholder={
                  draft.securityContext.mode === "field"
                    ? "primary_tags.bu"
                    : "teamA"
                }
                onChange={(value) =>
                  setDraft((d) =>
                    d && d.securityContext
                      ? {
                          ...d,
                          securityContext: { ...d.securityContext, value },
                        }
                      : d,
                  )
                }
              />
            </Flex>
          )}

          <MatcherField
            value={draft.routeMatcher}
            onChange={(value) =>
              setDraft((d) => (d ? { ...d, routeMatcher: value } : d))
            }
          />

          <Flex flexDirection="column" gap={2} style={{ minWidth: 280 }}>
            <Paragraph>Pipeline custom ID</Paragraph>
            <TextInput
              value={draft.pipelineCustomId}
              onChange={(value) =>
                setDraft((d) => (d ? { ...d, pipelineCustomId: value } : d))
              }
            />
            <Hint>
              The stable identifier for the OpenPipeline pipeline this app
              generates and owns for the default profile. Leave this as is; for
              a second, independent pipeline create a profile on the Profiles
              tab.
            </Hint>
          </Flex>
        </Flex>
      </Flex>
      {issues.length > 0 && (
        <Surface padding={20}>
          <Flex flexDirection="column" gap={4}>
            <Paragraph>
              <strong>Cannot save:</strong>
            </Paragraph>
            {issues.map((issue, i) => (
              <Paragraph key={i}>
                {issue.field}: {issue.message}
              </Paragraph>
            ))}
          </Flex>
        </Surface>
      )}
      {saveState === "saved" && !dirty && (
        <Paragraph>
          Saved. To make it take effect on events, deploy it from the Pipeline
          screen.
        </Paragraph>
      )}
      <SaveBar
        dirty={dirty}
        saving={saveState === "saving"}
        canSave={issues.length === 0}
        blockedReason="Fix the problems listed above to save."
        error={saveState === "error" ? saveError : null}
        saveLabel="Save settings"
        onSave={handleSave}
        onDiscard={() => {
          setDraft(null);
          setSaveState("idle");
        }}
      />
      {DEBUG_ENABLED && <DebugPanel />} {/* DEBUG-HOOK */}
      <RulesTransfer />
      <DangerZone registry={saved ?? draft} />
    </Flex>
  );
};
