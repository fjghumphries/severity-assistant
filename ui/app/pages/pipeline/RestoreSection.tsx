import React, { useRef, useState } from "react";

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
  BackupFile,
  BackupKind,
  downloadBackup,
  makeBackup,
  parseBackup,
} from "../../lib/backup/backupFile";
import {
  canonical,
  isOwned,
  LivePipeline,
  LivePipelineValue,
  PIPELINE_STAGES,
} from "../../lib/deploy/plan";
import {
  describeWriteError,
  LiveRouting,
  PIPELINES_SCHEMA_ID,
  readLivePipeline,
  readRouting,
  restorePipeline,
  restoreRouting,
  ROUTING_SCHEMA_ID,
} from "../../lib/deploy/pipelineApi";
import type { RoutingEntry } from "../../lib/deploy/routing";

interface Props {
  /** Which object this card backs up and restores. */
  kind: BackupKind;
  customId: string;
  live: LivePipeline | null;
  /** Called after a successful restore so the page can re-read what is live. */
  onRestored: () => void;
}

const SCHEMAS = { pipeline: PIPELINES_SCHEMA_ID, routing: ROUTING_SCHEMA_ID };

function processorIds(value: Record<string, unknown>): string[] {
  return PIPELINE_STAGES.flatMap((stage) => {
    const s = value[stage] as { processors?: { id: string }[] } | undefined;
    return (s?.processors ?? []).map((p) => p.id);
  });
}

const when = (iso: string) =>
  new Date(iso).getTime() === 0
    ? "an unknown date"
    : new Date(iso).toLocaleString();

/** Restore a pipeline or routing object from a backup file saved on this computer. */
export const RestoreSection = ({ kind, customId, live, onRestored }: Props) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<BackupFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [backupCurrent, setBackupCurrent] = useState(false);
  const [writing, setWriting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const onFile = async (file: File | undefined) => {
    setBackup(null);
    setFileError(null);
    setConfirming(false);
    setMessage(null);
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text(), SCHEMAS);
      if (parsed.kind !== kind) {
        throw new Error(
          `This is a ${parsed.kind} backup. Use the ${parsed.kind === "pipeline" ? "Pipeline" : "Routing"} restore card instead.`,
        );
      }
      if (parsed.kind === "pipeline" && parsed.value.customId !== customId) {
        throw new Error(
          `This backup is for pipeline "${String(parsed.value.customId)}", but this app manages "${customId}".`,
        );
      }
      setBackup(parsed);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : String(e));
    }
  };

  const restore = async () => {
    if (!backup) return;
    setWriting(true);
    setMessage(null);
    try {
      // Re-read right before writing so the version check covers any edit made since the page loaded.
      if (backup.kind === "pipeline") {
        const fresh = await readLivePipeline(customId);
        if (backupCurrent && fresh)
          downloadBackup(makeBackup("pipeline", PIPELINES_SCHEMA_ID, fresh));
        await restorePipeline(fresh, backup.value as LivePipelineValue);
      } else {
        const fresh = await readRouting();
        if (backupCurrent)
          downloadBackup(makeBackup("routing", ROUTING_SCHEMA_ID, fresh));
        await restoreRouting(fresh, backup.value as LiveRouting["value"]);
      }
      setMessage({
        ok: true,
        text: `Restored the ${backup.kind} from the backup taken ${when(backup.createdAt)}.`,
      });
      setBackup(null);
      onRestored();
    } catch (e) {
      setMessage({
        ok: false,
        text: `Restore failed: ${describeWriteError(e)}`,
      });
    } finally {
      setWriting(false);
      setConfirming(false);
    }
  };

  const ids = backup?.kind === "pipeline" ? processorIds(backup.value) : [];
  const owned = ids.filter(isOwned).length;
  const identical =
    backup?.kind === "pipeline" &&
    live !== null &&
    canonical(backup.value) === canonical(live.value);
  const entries =
    backup?.kind === "routing"
      ? (backup.value.routingEntries as RoutingEntry[])
      : [];

  return (
    <Surface padding={16} style={{ flex: 1, minWidth: 320 }}>
      <Flex flexDirection="column" gap={8}>
        <Heading level={4}>
          {kind === "pipeline"
            ? "Pipeline backup and restore"
            : "Routing backup and restore"}
        </Heading>
        <Text>
          {kind === "pipeline"
            ? "What it covers: the severity logic this app generates (the pipeline's processors). Not your rules (kept in the app) and not routing. Saved before a deploy."
            : "What it covers: the tenant-wide list that decides which Davis events go to which pipeline, including routes this app does not own. Saved before enabling or disabling the route."}
        </Text>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Flex gap={8}>
          <Button
            variant="emphasized"
            disabled={writing}
            onClick={() => fileRef.current?.click()}
          >
            {kind === "pipeline"
              ? "Choose pipeline backup file..."
              : "Choose routing backup file..."}
          </Button>
        </Flex>

        {fileError && (
          <Flex alignItems="center" gap={8}>
            <CriticalIcon />
            <Paragraph>{fileError}</Paragraph>
          </Flex>
        )}

        {backup && (
          <Flex flexDirection="column" gap={8}>
            <Paragraph>
              <Strong>
                {backup.kind === "pipeline" ? "Pipeline" : "Routing"} backup
              </Strong>{" "}
              taken {when(backup.createdAt)}.
            </Paragraph>
            {backup.kind === "pipeline" ? (
              <>
                <Text>
                  Contains {ids.length} processors ({owned} managed by the app,{" "}
                  {ids.length - owned} other).
                </Text>
                <Text>
                  {live === null
                    ? "The pipeline does not exist now: it will be re-created from the backup."
                    : identical
                      ? "Identical to the live pipeline: restoring changes nothing."
                      : "Differs from the live pipeline: restoring replaces the live pipeline entirely, including anything added since."}
                </Text>
              </>
            ) : (
              <>
                <Text>Routing order in the backup:</Text>
                {entries.map((e, i) => (
                  <Text key={i}>
                    {i + 1}. {e.description}
                    {e.enabled ? "" : " (disabled)"}
                  </Text>
                ))}
                <Text>
                  Restoring routing changes which pipeline receives live Davis
                  events right away.
                </Text>
              </>
            )}

            <Checkbox
              value={backupCurrent}
              onChange={setBackupCurrent}
              disabled={writing}
            >
              Download a backup of the current {backup.kind} first
            </Checkbox>
            <Flex gap={8}>
              {!confirming ? (
                <Button
                  variant="accent"
                  disabled={identical || writing}
                  onClick={() => setConfirming(true)}
                >
                  Restore...
                </Button>
              ) : (
                <>
                  <Button
                    variant="accent"
                    disabled={writing}
                    onClick={() => void restore()}
                  >
                    {writing ? "Restoring..." : "Confirm restore"}
                  </Button>
                  <Button
                    variant="emphasized"
                    disabled={writing}
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </Flex>
          </Flex>
        )}

        {message && (
          <Flex alignItems="center" gap={8}>
            {!message.ok && <CriticalIcon />}
            <Paragraph>{message.text}</Paragraph>
          </Flex>
        )}
      </Flex>
    </Surface>
  );
};
