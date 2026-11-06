import React, { useState } from "react";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Checkbox } from "@dynatrace/strato-components/forms";
import { Modal } from "@dynatrace/strato-components/overlays";
import { CriticalIcon } from "@dynatrace/strato-icons";

import { downloadBackup, makeBackup } from "../../lib/backup/backupFile";
import {
  deletePipeline,
  describeWriteError,
  PIPELINES_SCHEMA_ID,
  readLivePipeline,
  readRouting,
  ROUTING_SCHEMA_ID,
  writeRouting,
} from "../../lib/deploy/pipelineApi";
import { planRemoveRoute } from "../../lib/deploy/routing";
import { Intro } from "../../components/HelpTip";

interface Props {
  /** The profile being uninstalled; only its own route and pipeline are touched. */
  profileName: string;
  customId: string;
  /** Whether this profile's pipeline currently exists in the tenant. */
  deployed: boolean;
  /** True while this profile's route is enabled (events are flowing through the pipeline). */
  routeIsLive: boolean;
  onDone: () => void;
  /** Rendered inside a list of profiles, so the surrounding card and heading come from there. */
  compact?: boolean;
}

/** Removes the app from the tenant: its routing entry first, then the pipeline. Rules and the
 * role registry live in the app and are kept, so the pipeline can be deployed again later. */
export const UninstallSection = ({
  profileName,
  customId,
  deployed,
  routeIsLive,
  onDone,
  compact = false,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [backupPipeline, setBackupPipeline] = useState(false);
  const [backupRouting, setBackupRouting] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const uninstall = async () => {
    setWorking(true);
    setMessage(null);
    let step = "reading the pipeline";
    try {
      // Read fresh rather than trusting what the page loaded: the write below is version-checked
      // against this read, and the backup must be of what is actually there now.
      const fresh = await readLivePipeline(customId);
      step = "reading the current routing";
      const routing = await readRouting();
      const removal = fresh
        ? planRemoveRoute(routing.value.routingEntries, fresh.objectId)
        : { entries: routing.value.routingEntries, hadRoute: false };
      if (backupRouting)
        downloadBackup(makeBackup("routing", ROUTING_SCHEMA_ID, routing));
      if (backupPipeline && fresh)
        downloadBackup(makeBackup("pipeline", PIPELINES_SCHEMA_ID, fresh));

      if (removal.hadRoute) {
        step = "removing the route";
        await writeRouting(routing, removal.entries);
      }
      step = "deleting the pipeline";
      if (fresh) await deletePipeline(fresh);
      setMessage({
        ok: true,
        text: `Uninstalled "${profileName}": its route and pipeline are gone. Its rules are kept.`,
      });
      setOpen(false);
      onDone();
    } catch (e) {
      setMessage({
        ok: false,
        text: `Uninstall stopped while ${step}: ${describeWriteError(e)}. Nothing after that step ran; refresh to see the current state.`,
      });
      onDone();
    } finally {
      setWorking(false);
    }
  };

  const body = (
    <>
      <Flex flexDirection="column" gap={8}>
        {!compact && <Heading level={3}>Uninstall</Heading>}
        <Intro
          tip={
            <>
              Removes the route and deletes the generated pipeline of the
              profile "{profileName}" from the tenant. Other profiles are not
              touched.
            </>
          }
        >
          Removes this profile's route and pipeline.
        </Intro>
        <Flex>
          <Button
            variant="emphasized"
            disabled={!deployed || working}
            onClick={() => setOpen(true)}
          >
            Uninstall pipeline...
          </Button>
        </Flex>
        {!deployed && (
          <Text>
            Nothing to uninstall: this profile has no pipeline in the tenant.
          </Text>
        )}
        {message && (
          <Flex alignItems="center" gap={8}>
            {!message.ok && <CriticalIcon />}
            <Paragraph>{message.text}</Paragraph>
          </Flex>
        )}
      </Flex>

      <Modal
        title={`Uninstall profile "${profileName}"`}
        show={open}
        size="medium"
        onDismiss={() => !working && setOpen(false)}
        footer={
          <Flex gap={8}>
            <Button
              variant="accent"
              disabled={working}
              onClick={() => void uninstall()}
            >
              {working ? "Uninstalling..." : "Uninstall"}
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
          <Flex flexDirection="column" gap={4}>
            <Strong>What happens</Strong>
            <Text>
              1. This profile's entry is removed from routing. Every other
              route, including other profiles', is untouched.
            </Text>
            <Text>2. The pipeline {customId} is deleted.</Text>
            <Text>
              3. This profile's rules and settings stay in the app, so you can
              deploy again later.
            </Text>
          </Flex>
          {routeIsLive ? (
            <Flex gap={8} alignItems="center">
              <CriticalIcon />
              <Text>
                The route is live: after this, Davis events stop getting their
                severity from this app. Severities already written to events are
                not undone.
              </Text>
            </Flex>
          ) : (
            <Text>The route is not live, so no event processing changes.</Text>
          )}
          <Flex flexDirection="column" gap={4}>
            <Strong>Backups (saved as files on this computer)</Strong>
            <Checkbox
              value={backupPipeline}
              onChange={setBackupPipeline}
              disabled={working}
            >
              Pipeline backup: the generated processors
            </Checkbox>
            <Checkbox
              value={backupRouting}
              onChange={setBackupRouting}
              disabled={working}
            >
              Routing backup: the tenant-wide route list
            </Checkbox>
          </Flex>
        </Flex>
      </Modal>
    </>
  );

  return compact ? body : <Surface padding={16}>{body}</Surface>;
};
