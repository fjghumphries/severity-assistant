import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Strong,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Checkbox } from "@dynatrace/strato-components/forms";
import { CriticalIcon } from "@dynatrace/strato-icons";

import { downloadBackup, makeBackup } from "../../lib/backup/backupFile";
import {
  readRouting,
  ROUTING_SCHEMA_ID,
  writeRouting,
} from "../../lib/deploy/pipelineApi";
import type { LiveRouting } from "../../lib/deploy/pipelineApi";
import {
  describeRouteState,
  planRoute,
  RouteAction,
} from "../../lib/deploy/routing";
import { Intro } from "../../components/HelpTip";

interface Props {
  /** Settings objectId of the deployed app pipeline (the routing entry's pipelineId). */
  pipelineObjectId: string;
  matcher: string;
  /** True only when the deployed pipeline equals what the current rules compile to. */
  pipelineUpToDate: boolean;
  /** Route description for this profile; makes the route recognisable as app-managed. */
  routeDescription?: string;
  /** Reports the route state upward so the page can show it in the process overview. */
  onState?: (state: "absent" | "disabled" | "shadowed" | "live" | null) => void;
}

const STATE_TEXT = {
  absent: "No route points at the app pipeline: it receives no events.",
  disabled:
    "The app route exists but is disabled: the pipeline receives no events.",
  shadowed:
    "The app route is enabled but an enabled catch-all above it takes every event first.",
  live: "The app route is live: the pipeline sets event.severity on matching Davis events.",
} as const;

/**
 * Route control (D6b): a separate, explicitly confirmed action -- never a side effect of saving
 * rules. Enabling puts the app's single entry first (first match wins) and leaves every other
 * entry untouched; disabling is the one-click rollback. A routing backup is downloaded before
 * every write when ticked
 * (off by default); `RestoreSection` loads those files back.
 */
export const RouteSection = ({
  pipelineObjectId,
  matcher,
  pipelineUpToDate,
  routeDescription,
  onState,
}: Props) => {
  const [routing, setRouting] = useState<LiveRouting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<RouteAction | null>(null);
  const [writing, setWriting] = useState(false);
  const [backupFirst, setBackupFirst] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRouting(await readRouting());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const state = useMemo(
    () =>
      routing
        ? describeRouteState(routing.value.routingEntries, pipelineObjectId)
        : null,
    [routing, pipelineObjectId],
  );
  const stateName = state?.state ?? null;
  useEffect(() => {
    onState?.(stateName);
  }, [stateName, onState]);

  const plan = useMemo(
    () =>
      routing && pending
        ? planRoute(
            routing.value.routingEntries,
            pipelineObjectId,
            matcher,
            pending,
            routeDescription,
          )
        : null,
    [routing, pending, pipelineObjectId, matcher, routeDescription],
  );

  const apply = async () => {
    if (!routing || !plan) return;
    setWriting(true);
    setMessage(null);
    try {
      if (backupFirst)
        downloadBackup(makeBackup("routing", ROUTING_SCHEMA_ID, routing));
      await writeRouting(routing, plan.entries);
      setMessage(
        plan.action === "enable" ? "Route enabled." : "Route disabled.",
      );
    } catch (e) {
      setMessage(
        `Routing write failed (a version conflict means someone changed routing since it was read): ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setWriting(false);
      setPending(null);
      await load();
    }
  };

  return (
    <Flex flexDirection="column" gap={8}>
      <Heading level={3}>Route</Heading>
      <Intro
        tip={
          <>
            Routing decides which Davis events go through this pipeline.
            Enabling it is what makes severities change. The route goes first
            and takes every event its matcher matches, so other routes stop
            receiving them: if you need your own Davis event routing, this app
            is not for you.
          </>
        }
      >
        Routing decides which Davis events use this pipeline.
      </Intro>
      {error && (
        <Flex alignItems="center" gap={8}>
          <CriticalIcon />
          <Paragraph>Could not read routing: {error}</Paragraph>
          <Button variant="emphasized" onClick={() => void load()}>
            Retry
          </Button>
        </Flex>
      )}
      {state && <Paragraph>{STATE_TEXT[state.state]}</Paragraph>}
      {state?.shadowedBy.map((e) => (
        <Paragraph key={e.pipelineId}>
          Shadowed by: <Strong>{e.description}</Strong> (matcher{" "}
          {e.matcher.trim()})
        </Paragraph>
      ))}
      {!pipelineUpToDate && (
        <Paragraph>
          Deploy the pipeline first: the deployed pipeline does not match the
          current rules, and enabling the route would send live events through a
          stale version.
        </Paragraph>
      )}

      {plan && (
        <Flex flexDirection="column" gap={4}>
          <Paragraph>
            <Strong>
              {plan.action === "enable" ? "Enable" : "Disable"} the app route.
            </Strong>{" "}
            Resulting order:{" "}
            {plan.entries
              .map((e) => `${e.description}${e.enabled ? "" : " (disabled)"}`)
              .join(" > ")}
          </Paragraph>
          {plan.warnings.map((w, i) => (
            <Paragraph key={i}>Warning: {w}</Paragraph>
          ))}
          <Checkbox
            value={backupFirst}
            onChange={setBackupFirst}
            disabled={writing}
          >
            Download a backup of the current routing first
          </Checkbox>
        </Flex>
      )}

      <Flex gap={8}>
        {!pending ? (
          <>
            <Button
              variant="accent"
              disabled={
                !routing ||
                writing ||
                !pipelineUpToDate ||
                state?.state === "live"
              }
              onClick={() => setPending("enable")}
            >
              Enable route...
            </Button>
            <Button
              variant="emphasized"
              disabled={
                !routing ||
                writing ||
                state?.state === "absent" ||
                state?.state === "disabled"
              }
              onClick={() => setPending("disable")}
            >
              Disable route...
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="accent"
              disabled={writing || plan?.noChange}
              onClick={() => void apply()}
            >
              {writing ? "Writing..." : "Confirm"}
            </Button>
            <Button
              variant="emphasized"
              disabled={writing}
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
          </>
        )}
      </Flex>
      {message && <Paragraph>{message}</Paragraph>}
    </Flex>
  );
};
