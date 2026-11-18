import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Checkbox, TextInput } from "@dynatrace/strato-components/forms";
import { Chip, ProgressCircle } from "@dynatrace/strato-components/content";
import { Modal } from "@dynatrace/strato-components/overlays";
import { CriticalIcon } from "@dynatrace/strato-icons";

import { resetAppState } from "../../lib/config/appReset";
import { Prose } from "../../components/Prose";
import { useFlowStatus } from "../../lib/config/FlowStatus";
import { clearProfileRules } from "../../lib/config/profileCleanup";
import { useRuleCount } from "../../lib/config/useRuleCount";
import { listProfiles } from "../../lib/config/profiles";
import {
  describeWriteError,
  readPipelineIndex,
  readRouting,
} from "../../lib/deploy/pipelineApi";
import { uninstallPipeline } from "../../lib/deploy/uninstall";
import { describeRouteState } from "../../lib/deploy/routing";
import type { RoleRegistry } from "../../lib/types/registry";

const CONFIRM_WORD = "RESET";

/**
 * Empties one profile's rules but keeps the profile: its matcher, fallback severity and pipeline
 * stay, so a large rule set can be started over without recreating anything around it. Deployed
 * processors are unaffected until the next deploy, which is what makes this safe to offer.
 */
const ClearRules = ({
  profileId,
  profileName,
}: {
  profileId: string;
  profileName: string;
}) => {
  const count = useRuleCount(profileId);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const empty = count !== null && count.total === 0;

  const clear = () => {
    setWorking(true);
    setNote(null);
    clearProfileRules(profileId)
      .then(() => {
        setNote({
          ok: true,
          text: "Rules deleted. The deployed pipeline still has the old ones until you deploy again.",
        });
        setOpen(false);
      })
      .catch((e: Error) => setNote({ ok: false, text: e.message }))
      .finally(() => setWorking(false));
  };

  return (
    <Flex flexDirection="column" gap={4}>
      <Flex alignItems="center" gap={8} flexWrap="wrap">
        <Button
          variant="emphasized"
          color="critical"
          disabled={empty || working}
          onClick={() => setOpen(true)}
        >
          Delete all rules...
        </Button>
        <Text>
          {count === null
            ? "counting rules..."
            : count.total === 0
              ? "no rules stored"
              : `${count.total} rule${count.total === 1 ? "" : "s"} (${count.enabled} enabled)`}
        </Text>
      </Flex>
      {note && (
        <Flex alignItems="center" gap={8}>
          {!note.ok && <CriticalIcon />}
          <Text>{note.text}</Text>
        </Flex>
      )}

      <Modal
        title={`Delete all rules in "${profileName}"?`}
        show={open}
        size="small"
        onDismiss={() => !working && setOpen(false)}
        footer={
          <Flex gap={8}>
            <Button
              variant="accent"
              color="critical"
              disabled={working}
              onClick={clear}
            >
              {working ? "Deleting..." : `Delete ${count?.total ?? ""} rules`}
            </Button>
            <Button
              variant="emphasized"
              disabled={working}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </Flex>
        }
      >
        <Flex flexDirection="column" gap={12}>
          <Text>
            Deletes every rule and exception in this profile. This cannot be
            undone.
          </Text>
          <Text>
            The profile itself stays: its route matcher, fallback severity and
            pipeline are untouched, so you can start the rule set over.
          </Text>
          <Text>
            <Strong>Events keep their current severity</Strong> until you deploy
            again -- the deployed pipeline still holds the old rules. Deploying
            an empty rule set makes every event fall back to this profile&apos;s
            &quot;when no rule matches&quot; setting.
          </Text>
        </Flex>
      </Modal>
    </Flex>
  );
};

interface Row {
  id: string;
  name: string;
  pipelineCustomId: string;
  deployed: boolean;
  routeIsLive: boolean;
}

/**
 * Everything that forgets the app's configuration: a profile's rules and the full reset (which can
 * also remove the pipelines and routes). Uninstalling one profile's pipeline lives on the Pipeline
 * screen, next to the pipeline itself.
 */
export const DangerZone = ({ registry }: { registry: RoleRegistry }) => {
  const { refresh: refreshFlowStatus } = useFlowStatus();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [working, setWorking] = useState(false);
  const [alsoUninstall, setAlsoUninstall] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const profiles = useMemo(() => listProfiles(registry), [registry]);

  const load = useCallback(async () => {
    const [pipelines, routing] = await Promise.allSettled([
      readPipelineIndex(),
      readRouting(),
    ]);
    const index = pipelines.status === "fulfilled" ? pipelines.value : null;
    const entries =
      routing.status === "fulfilled"
        ? routing.value.value.routingEntries
        : null;
    setRows(
      profiles.map((p) => {
        const customId = p.isDefault
          ? registry.pipelineCustomId
          : (registry.profiles?.find((x) => x.id === p.id)?.pipelineCustomId ??
            "");
        const objectId = index?.get(customId);
        const state =
          objectId && entries
            ? describeRouteState(
                entries.map((e) => ({
                  ...e,
                  description: "",
                  pipelineType: "custom",
                })),
                objectId,
              ).state
            : null;
        return {
          id: p.id,
          name: p.name,
          pipelineCustomId: customId,
          deployed: Boolean(objectId),
          routeIsLive: state === "live",
        };
      }),
    );
  }, [profiles, registry]);

  useEffect(() => {
    void load();
  }, [load]);

  const deployedCount = rows?.filter((r) => r.deployed).length ?? 0;

  const reset = async () => {
    setWorking(true);
    setMessage(null);
    try {
      // Pipelines first: once the settings are gone the app no longer knows their names.
      const removed: string[] = [];
      if (alsoUninstall) {
        for (const row of rows?.filter((r) => r.deployed) ?? []) {
          try {
            await uninstallPipeline(row.pipelineCustomId);
            removed.push(row.name);
          } catch (e) {
            setMessage({
              ok: false,
              text: `Nothing was reset. Uninstalling "${row.name}" failed: ${describeWriteError(e)}. ${
                removed.length > 0
                  ? `Already removed: ${removed.join(", ")}.`
                  : "Nothing was removed."
              } Fix that or untick the option, then try again.`,
            });
            void load();
            refreshFlowStatus();
            return;
          }
        }
      }
      const outcome = await resetAppState(profiles.map((p) => p.id));
      if (outcome.failed.length > 0) {
        setMessage({
          ok: false,
          text: `Reset incomplete: ${outcome.failed.length} of ${
            outcome.failed.length +
            outcome.deleted.length +
            outcome.cleared.length
          } settings could not be removed (${outcome.failed[0].message}).`,
        });
      } else {
        setMessage({
          ok: true,
          text:
            outcome.cleared.length > 0
              ? "Settings emptied. Deleting the keys outright needs the state:app-states:delete permission -- restart the dev server to grant it. Reload the app to start fresh."
              : `Every setting and rule set has been deleted${
                  removed.length > 0
                    ? `, and ${removed.length} pipeline${removed.length === 1 ? "" : "s"} and ${removed.length === 1 ? "its route" : "their routes"} removed from the tenant`
                    : ""
                }. Reload the app to start fresh.`,
        });
      }
      setResetOpen(false);
      setConfirmText("");
      void load();
      refreshFlowStatus();
    } catch (e) {
      setMessage({
        ok: false,
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Flex flexDirection="column" gap={12}>
      <Heading level={3}>Remove and reset</Heading>
      <Prose>
        Two things live here: delete one profile&apos;s rules and keep the
        profile, or reset the app and forget everything it has stored. Taking a
        profile&apos;s pipeline and route out of the tenant while keeping its
        rules is on the Pipeline screen.
      </Prose>

      <Heading level={4}>Per profile</Heading>
      {rows === null ? (
        <Flex alignItems="center" gap={8}>
          <ProgressCircle />
          <Paragraph>Checking what is deployed...</Paragraph>
        </Flex>
      ) : (
        rows.map((row) => (
          <Surface key={row.id} padding={12}>
            <Flex flexDirection="column" gap={8}>
              <Flex alignItems="center" gap={8} flexWrap="wrap">
                <Strong>{row.name}</Strong>
                <Chip
                  color={row.deployed ? "success" : "neutral"}
                  size="condensed"
                >
                  {row.deployed ? "Pipeline deployed" : "Not deployed"}
                </Chip>
                {row.routeIsLive && (
                  <Chip color="warning" size="condensed">
                    Route live
                  </Chip>
                )}
                <Text>{row.pipelineCustomId}</Text>
              </Flex>
              <ClearRules profileId={row.id} profileName={row.name} />
              {row.deployed && (
                <Text>
                  To take this profile&apos;s pipeline and route out of the
                  tenant, select the profile and use Uninstall on the Pipeline
                  screen.
                </Text>
              )}
            </Flex>
          </Surface>
        ))
      )}

      <Heading level={4}>Reset the app</Heading>
      <Prose>
        Returns the app to a fresh install. It deletes everything stored in the
        app (the label mapping, every profile and every rule set) and, if you
        tick the option, the pipelines and routes the app deployed in the
        tenant. It does not change events that were already processed, and it
        never touches pipelines or routes it did not create.
      </Prose>
      <Flex>
        <Button
          variant="accent"
          color="critical"
          disabled={working}
          onClick={() => setResetOpen(true)}
        >
          Reset the app...
        </Button>
      </Flex>

      {message && (
        <Flex alignItems="center" gap={8}>
          {!message.ok && <CriticalIcon />}
          <Paragraph>{message.text}</Paragraph>
        </Flex>
      )}

      <Modal
        title="Reset the app?"
        show={resetOpen}
        size="small"
        onDismiss={() => !working && setResetOpen(false)}
        footer={
          <Flex gap={8}>
            <Button
              variant="accent"
              color="critical"
              disabled={
                working || confirmText.trim().toUpperCase() !== CONFIRM_WORD
              }
              onClick={() => void reset()}
            >
              {working ? "Resetting..." : "Reset everything"}
            </Button>
            <Button
              variant="emphasized"
              disabled={working}
              onClick={() => setResetOpen(false)}
            >
              Cancel
            </Button>
          </Flex>
        }
      >
        <Flex flexDirection="column" gap={12}>
          <Text>
            <Strong>In the app, deleted for good:</Strong>
          </Text>
          <Text>
            - The label mapping and the default profile&apos;s settings.
          </Text>
          <Text>
            - All {profiles.length} profile{profiles.length === 1 ? "" : "s"}{" "}
            and their rules.
          </Text>
          <Text>
            <Strong>In the tenant:</Strong>{" "}
            {deployedCount === 0
              ? "nothing to remove, the app has no deployed pipeline."
              : "choose below whether the pipelines and routes the app deployed are removed too."}
          </Text>
          {deployedCount > 0 && (
            <Checkbox value={alsoUninstall} onChange={setAlsoUninstall}>
              Also remove the {deployedCount} deployed pipeline
              {deployedCount === 1 ? "" : "s"} and{" "}
              {deployedCount === 1 ? "its route" : "their routes"} from the
              tenant (recommended)
            </Checkbox>
          )}
          <Text>
            <Strong>Never touched:</Strong> events already processed keep the
            severity they were given, other teams&apos; routes and pipelines,
            and backup files you downloaded.
          </Text>
          {deployedCount > 0 && !alsoUninstall && (
            <Flex gap={8} alignItems="center">
              <CriticalIcon />
              <Text>
                {deployedCount === 1 ? "It keeps" : "They keep"} running with
                nothing in the app pointing at{" "}
                {deployedCount === 1 ? "it" : "them"}, and events still get the
                old severities.
              </Text>
            </Flex>
          )}
          <Flex flexDirection="column" gap={2}>
            <Paragraph>
              Type <Strong>{CONFIRM_WORD}</Strong> to confirm
            </Paragraph>
            <TextInput
              value={confirmText}
              onChange={setConfirmText}
              placeholder={CONFIRM_WORD}
            />
          </Flex>
        </Flex>
      </Modal>
    </Flex>
  );
};
