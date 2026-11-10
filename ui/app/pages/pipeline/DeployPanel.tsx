import React from "react";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Checkbox } from "@dynatrace/strato-components/forms";
import { CriticalIcon } from "@dynatrace/strato-icons";

import {
  describeChangeLine,
  describeChangeLines,
  type ChangeSummary,
} from "../../lib/deploy/describe";
import type { DeployPlan } from "../../lib/deploy/plan";
import type { RoleRegistry } from "../../lib/types/registry";

const Row = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <Flex gap={16} alignItems="baseline">
    <Strong style={{ width: 150, flexShrink: 0 }}>{label}</Strong>
    <Text>{children}</Text>
  </Flex>
);

const MAX_LINES = 10;

/** One change per line, collapsed past ten so a large publish stays readable. */
const ChangeList = ({ summary }: { summary: ChangeSummary }) => {
  const [all, setAll] = React.useState(false);
  const lines = describeChangeLines(summary);
  if (lines.length === 0) return <Text>{describeChangeLine(summary)}</Text>;
  const shown = all ? lines : lines.slice(0, MAX_LINES);
  return (
    <Flex flexDirection="column" gap={2} style={{ paddingLeft: 166 }}>
      {shown.map((l, i) => (
        <Text key={i}>&bull; {l}</Text>
      ))}
      {lines.length > MAX_LINES && (
        <Flex>
          <Button variant="emphasized" onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `Show all ${lines.length} changes`}
          </Button>
        </Flex>
      )}
    </Flex>
  );
};

const fallbackText = (registry: RoleRegistry): string => {
  const { mode, value } = registry.defaultSeverity;
  if (mode === "set") return `get severity ${value}`;
  if (mode === "flag")
    return `get severity ${value} and are flagged sa.unmatched`;
  return "keep the severity they already have";
};

interface Props {
  /** Enabled rules in this profile; zero means the pipeline only carries the final combiner. */
  activeRules: number;
  plan: DeployPlan;
  summary: ChangeSummary;
  registry: RoleRegistry;
  processorCount: number;
  backupFirst: boolean;
  onBackupFirst: (v: boolean) => void;
  confirming: boolean;
  deploying: boolean;
  onStart: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRefresh: () => void;
  message: { ok: boolean; text: string } | null;
}

/** The Deploy step: a compact "what the button does" table, then the guarded action. */
export const DeployPanel = (p: Props) => {
  const { plan } = p;
  const creating = plan.mode === "create";
  // With no rules the pipeline is still one processor: the combiner that writes event.severity.
  // That is inert only when unmatched events are left alone -- otherwise it stamps every event.
  const stampsEverything =
    p.activeRules === 0 && p.registry.defaultSeverity.mode !== "leave";
  return (
    <Surface padding={24}>
      <Flex flexDirection="column" gap={12}>
        <Heading level={3}>Publish changes</Heading>
        {stampsEverything && (
          <Flex alignItems="center" gap={8}>
            <CriticalIcon />
            <Paragraph>
              <Strong>
                This profile has no rules, so every event it takes would be set
                to severity {p.registry.defaultSeverity.value}.
              </Strong>{" "}
              That is the &quot;when no rule matches&quot; setting doing the
              work, not a rule. Set it to &quot;Leave severity untouched&quot;
              in Settings if you want a rule-less pipeline to change nothing.
            </Paragraph>
          </Flex>
        )}

        {plan.noChange ? (
          <Paragraph>
            The live pipeline already matches your rules. Nothing to deploy.
          </Paragraph>
        ) : (
          <Flex flexDirection="column" gap={4}>
            <Row label="On confirm">
              {creating
                ? `Creates ${p.registry.pipelineCustomId} with ${p.processorCount} processors`
                : `Updates ${p.registry.pipelineCustomId} (${plan.added.length} processors added, ${plan.changed.length} changed, ${plan.removed.length} removed)`}
            </Row>
            {!creating && <ChangeList summary={p.summary} />}
            <Row label="Unmatched events">{`Events matching no rule ${fallbackText(p.registry)}`}</Row>
            <Row label="Other processors">
              {plan.foreign.length === 0
                ? "None in this pipeline"
                : `${plan.foreign.length} kept as they are`}
            </Row>
            <Row label="Backup">
              {p.backupFirst && !creating
                ? "Pipeline backup file downloads first"
                : "None"}
            </Row>
            <Row label="Routing">
              Not touched: events are unaffected until you enable the route
              below
            </Row>
          </Flex>
        )}

        <Checkbox
          value={p.backupFirst && !creating}
          onChange={p.onBackupFirst}
          disabled={creating || p.deploying || plan.noChange}
        >
          {creating
            ? "Download a pipeline backup first (nothing exists yet to back up)"
            : "Download a pipeline backup to this computer first"}
        </Checkbox>

        <Flex gap={8} alignItems="center">
          {!p.confirming ? (
            <Button
              variant="accent"
              disabled={plan.noChange || p.deploying}
              onClick={p.onStart}
            >
              {creating ? "Create pipeline..." : "Publish changes..."}
            </Button>
          ) : (
            <>
              <Button
                variant="accent"
                disabled={p.deploying}
                onClick={p.onConfirm}
              >
                {p.deploying ? "Writing..." : "Confirm write"}
              </Button>
              <Button
                variant="emphasized"
                disabled={p.deploying}
                onClick={p.onCancel}
              >
                Cancel
              </Button>
            </>
          )}
          <Button
            variant="emphasized"
            disabled={p.deploying}
            onClick={p.onRefresh}
          >
            Refresh
          </Button>
        </Flex>

        {p.message && (
          <Flex alignItems="center" gap={8}>
            {!p.message.ok && <CriticalIcon />}
            <Paragraph>{p.message.text}</Paragraph>
          </Flex>
        )}
      </Flex>
    </Surface>
  );
};
