import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import {
  Accordion,
  ProgressCircle,
} from "@dynatrace/strato-components/content";
import { CriticalIcon } from "@dynatrace/strato-icons";

import { compile } from "../lib/compiler";
import { useRules } from "../lib/config/useRules";
import {
  useEffectiveRegistry,
  useProfiles,
} from "../lib/config/ProfileContext";
import { buildDeployPlan, LivePipeline } from "../lib/deploy/plan";
import { downloadBackup, makeBackup } from "../lib/backup/backupFile";
import {
  describeWriteError,
  PIPELINES_SCHEMA_ID,
  readLivePipeline,
  writePipeline,
} from "../lib/deploy/pipelineApi";
import { PageHeader } from "../components/PageHeader";
import { useFlowStatus } from "../lib/config/FlowStatus";
import type { StepState } from "../components/steps";
import { DeployPanel } from "./pipeline/DeployPanel";
import { KpiTiles } from "./pipeline/KpiTiles";
import { PlanDetailsContent } from "./pipeline/PlanDetails";
import { RestoreSection } from "./pipeline/RestoreSection";
import { RouteSection } from "./pipeline/RouteSection";
import { useAnomalyDetectors } from "../lib/queries/useAnomalyDetectors";
import { summarizePlan } from "../lib/deploy/describe";
import { useDetectorNameLookup } from "./rules/shared";

type LiveState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; live: LivePipeline | null };

/**
 * Pipeline tab (Phase 4, docs/04 "Write protocol"): compile the current rules, read what is
 * live under the app's customId, show exactly what a save would add / change / remove with
 * foreign processors called out, then write with the version token captured at read time.
 *
 * Deliberately does NOT touch routing: an unrouted pipeline receives no events, so deploying
 * here is inert until the route is repointed -- a separate, explicitly confirmed action (D6b)
 * that follows a shadow run (docs/09).
 */
export const Pipeline = () => {
  const {
    rules,
    isLoading: rulesLoading,
    isError: rulesError,
    error: rulesErrorMsg,
  } = useRules();
  const {
    registry,
    isLoading: registryLoading,
    isError: registryError,
  } = useEffectiveRegistry();

  const { profiles, profile } = useProfiles();
  const { refresh: refreshFlowStatus } = useFlowStatus();
  const [liveState, setLiveState] = useState<LiveState>({ status: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [backupFirst, setBackupFirst] = useState(false);
  const [routeState, setRouteState] = useState<
    "absent" | "disabled" | "shadowed" | "live" | null
  >(null);
  const [deployMessage, setDeployMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const customId = registry?.pipelineCustomId;

  const loadLive = useCallback(async () => {
    if (!customId) return;
    setLiveState((prev) =>
      prev.status === "ready" ? prev : { status: "loading" },
    );
    try {
      setLiveState({ status: "ready", live: await readLivePipeline(customId) });
    } catch (e) {
      setLiveState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [customId]);

  useEffect(() => {
    void loadLive();
  }, [loadLive]);

  const compiled = useMemo(
    () => (registry ? compile(rules, registry) : null),
    [rules, registry],
  );

  const plan = useMemo(() => {
    if (!compiled?.ok || liveState.status !== "ready") return null;
    return buildDeployPlan(compiled.pipeline, liveState.live);
  }, [compiled, liveState]);

  const { detectors } = useAnomalyDetectors();
  const detectorName = useDetectorNameLookup(detectors);
  const summary = useMemo(
    () =>
      plan && registry && liveState.status === "ready"
        ? summarizePlan(plan, liveState.live, { rules, registry, detectorName })
        : null,
    [plan, registry, rules, liveState, detectorName],
  );

  // A success note describes the moment of writing and is wrong a step later (e.g. "inert" once the
  // route is enabled), so it goes away when the route changes; errors stay until the next attempt.
  useEffect(() => {
    setDeployMessage((prev) => (prev?.ok ? null : prev));
    // The side rail shows whether the route is live; it must follow a route change made here.
    refreshFlowStatus();
  }, [routeState, refreshFlowStatus]);

  const shownMessage = deployMessage?.ok
    ? {
        ok: true,
        text:
          routeState === "live"
            ? "Pipeline written. The route is live, so new events use it now."
            : "Pipeline written. It stays inert until a route points at it.",
      }
    : deployMessage;

  const deploy = async () => {
    if (!plan || liveState.status !== "ready") return;
    setDeploying(true);
    setDeployMessage(null);
    try {
      if (backupFirst && liveState.live) {
        downloadBackup(
          makeBackup("pipeline", PIPELINES_SCHEMA_ID, liveState.live),
        );
      }
      await writePipeline(plan, liveState.live);
      setDeployMessage({ ok: true, text: "" });
    } catch (e) {
      // A version conflict lands here: do not retry blindly -- re-read, re-diff, ask (docs/04).
      const msg = describeWriteError(e);
      setDeployMessage({
        ok: false,
        text: `Write failed (if this is a version conflict, someone changed the pipeline since it was read -- review the refreshed diff): ${msg}`,
      });
    } finally {
      setDeploying(false);
      setConfirming(false);
      await loadLive();
      refreshFlowStatus();
    }
  };

  if (rulesLoading || registryLoading || liveState.status === "loading") {
    return (
      <Flex flexDirection="column" padding={32} gap={32}>
        <Heading level={2}>Pipeline</Heading>
        <Flex alignItems="center" gap={8}>
          <ProgressCircle />
          <Paragraph>
            Loading rules, registry and the live pipeline...
          </Paragraph>
        </Flex>
      </Flex>
    );
  }

  if (rulesError || registryError || !registry || !compiled) {
    return (
      <Flex flexDirection="column" padding={32} gap={32}>
        <Heading level={2}>Pipeline</Heading>
        <Flex alignItems="center" gap={8}>
          <CriticalIcon />
          <Paragraph>
            {rulesErrorMsg ?? "Failed to load rules or the role registry."}
          </Paragraph>
        </Flex>
      </Flex>
    );
  }

  if (liveState.status === "error") {
    return (
      <Flex flexDirection="column" padding={32} gap={32}>
        <Heading level={2}>Pipeline</Heading>
        <Flex alignItems="center" gap={8}>
          <CriticalIcon />
          <Paragraph>
            Could not read the live pipeline: {liveState.message}
          </Paragraph>
          <Button variant="emphasized" onClick={() => void loadLive()}>
            Retry
          </Button>
        </Flex>
      </Flex>
    );
  }

  const activeRules = rules.filter((r) => r.enabled).length;
  const upToDate = plan?.noChange === true;
  const deployStatus: StepState = !compiled.ok
    ? { label: "Blocked by rule errors", tone: "critical" }
    : !liveState.live
      ? { label: "Not created yet", tone: "warning" }
      : upToDate
        ? { label: "Up to date", tone: "success" }
        : { label: "Changes pending", tone: "warning" };
  const routeStatus: StepState =
    routeState === "live"
      ? { label: "Live", tone: "success" }
      : routeState === "shadowed"
        ? { label: "Shadowed", tone: "critical" }
        : routeState === "disabled"
          ? { label: "Disabled", tone: "neutral" }
          : { label: "Not routed", tone: "neutral" };

  return (
    <Flex flexDirection="column" padding={32} gap={32}>
      <PageHeader
        title={profiles.length > 1 ? `Pipeline -- ${profile.name}` : "Pipeline"}
        subtitle="Turn this profile's rules into a live severity pipeline. Nothing reaches an event until its route is on."
        chips={[deployStatus, routeStatus]}
        note={
          !compiled.ok
            ? "These rules do not compile yet -- see below."
            : activeRules === 0
              ? registry.defaultSeverity.mode === "leave"
                ? "No rules: deploying would leave every severity as it is."
                : `No rules: deploying would set severity ${registry.defaultSeverity.value} on every event this profile takes.`
              : undefined
        }
        action={
          !compiled.ok || activeRules === 0
            ? { label: "Go to Rules", to: "/rules" }
            : routeState === "live"
              ? { label: "Go to Results", to: "/results" }
              : undefined
        }
      />

      {!compiled.ok && (
        <Flex flexDirection="column" gap={4}>
          <Flex alignItems="center" gap={8}>
            <CriticalIcon />
            <Strong>Rules do not compile -- fix these before deploying</Strong>
          </Flex>
          {compiled.errors.map((issue, i) => (
            <Paragraph key={i}>{issue.message}</Paragraph>
          ))}
        </Flex>
      )}

      {compiled.ok && plan && summary && (
        <>
          {compiled.warnings.map((w, i) => (
            <Paragraph key={i}>Warning: {w.message}</Paragraph>
          ))}
          <KpiTiles summary={summary} />
          <DeployPanel
            plan={plan}
            summary={summary}
            registry={registry}
            activeRules={activeRules}
            processorCount={compiled.stats.processorCount}
            backupFirst={backupFirst}
            onBackupFirst={setBackupFirst}
            confirming={confirming}
            deploying={deploying}
            onStart={() => setConfirming(true)}
            onConfirm={() => void deploy()}
            onCancel={() => setConfirming(false)}
            onRefresh={() => void loadLive()}
            message={shownMessage}
          />
        </>
      )}

      {liveState.live && (
        <Surface padding={24}>
          <RouteSection
            routeDescription={registry.routeDescription}
            pipelineObjectId={liveState.live.objectId}
            matcher={registry.routeMatcher}
            pipelineUpToDate={upToDate}
            onState={setRouteState}
          />
        </Surface>
      )}

      {/* Used rarely, so out of the way: deploying and routing are the act, this is the safety net. */}
      <Accordion>
        <Accordion.Section id="advanced">
          <Accordion.SectionLabel>
            Advanced: backup and restore, technical details
          </Accordion.SectionLabel>
          <Accordion.SectionContent>
            <Flex flexDirection="column" gap={16}>
              <Flex flexDirection="column" gap={8}>
                <Text>
                  Backups are files saved on your computer. The pipeline and the
                  routing list are backed up and restored separately.
                </Text>
                <Flex gap={16} flexWrap="wrap">
                  <RestoreSection
                    kind="pipeline"
                    customId={registry.pipelineCustomId}
                    live={liveState.live}
                    onRestored={() => void loadLive()}
                  />
                  <RestoreSection
                    kind="routing"
                    customId={registry.pipelineCustomId}
                    live={liveState.live}
                    onRestored={() => void loadLive()}
                  />
                </Flex>
              </Flex>
              {plan && <PlanDetailsContent plan={plan} />}
              <Text>
                To take this profile&apos;s pipeline and route out of the
                tenant, or to reset the app, go to Settings &gt; Remove and
                reset.
              </Text>
            </Flex>
          </Accordion.SectionContent>
        </Accordion.Section>
      </Accordion>

      {shownMessage && !(compiled.ok && plan) && (
        <Flex alignItems="center" gap={8}>
          {!shownMessage.ok && <CriticalIcon />}
          <Paragraph>{shownMessage.text}</Paragraph>
        </Flex>
      )}
    </Flex>
  );
};
