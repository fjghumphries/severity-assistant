import React, { useMemo, useRef } from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Text,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { CriticalIcon } from "@dynatrace/strato-icons";

import { PageHeader } from "../components/PageHeader";
import { StatTile } from "../components/StatTile";
import { useRules, useSaveRules } from "../lib/config/useRules";
import { useRegistry } from "../lib/config/useRegistry";
import { useDiscovery } from "../lib/queries/useDiscovery";
import { deriveEventCatalogue } from "../lib/queries/derive";
import { useAnomalyDetectors } from "../lib/queries/useAnomalyDetectors";
import { simulate } from "../lib/simulate/simulate";
import { isException, Rule } from "../lib/types/rule";
import { RulesTree } from "./rules/RulesTree";
import { useDetectorNameLookup } from "./rules/shared";

/**
 * Rules tab (D19): split into a **Defaults** sub-tab (target-only rules, zero role conditions)
 * and an **Exceptions** sub-tab (role-conditioned overrides with explicit order, D20). Both
 * screens read and write the same `Rule[]` array under the same App State key -- this is a UI
 * split by condition count, not a second store (docs/03 Part 6). Data loading (rules, registry,
 * event discovery, anomaly detectors) happens once here and is passed down, so switching tabs
 * doesn't re-fetch anything.
 *
 * Step 2 of the flow: the summary tiles show what is configured and how much of the recent event
 * traffic the rules touch, and the banner points at Step 3 (Pipeline) where they take effect.
 */
export const Rules = () => {
  const {
    rules,
    isLoading: rulesLoading,
    isError: rulesError,
    error: rulesErrorMsg,
    refetch,
  } = useRules();
  const saveRules = useSaveRules();
  const {
    registry,
    isLoading: registryLoading,
    isError: registryError,
  } = useRegistry();
  const loadedOnce = useRef(false);
  if (!rulesLoading && !registryLoading) loadedOnce.current = true;
  const { rows: discoveryRows } = useDiscovery("2h");
  const eventCatalogue = useMemo(
    () => deriveEventCatalogue(discoveryRows),
    [discoveryRows],
  );
  const { detectors } = useAnomalyDetectors();
  const detectorName = useDetectorNameLookup(detectors);

  const counts = useMemo(() => {
    const enabled = rules.filter((r) => r.enabled);
    return {
      defaults: enabled.filter((r) => !isException(r)).length,
      exceptions: enabled.filter((r) => isException(r)).length,
      disabled: rules.length - enabled.length,
    };
  }, [rules]);

  // Event-level estimate over the last 2 hours; detector and threshold rules cannot be evaluated
  // from the discovery rows, so the figure is a lower bound (the Results tab says the same).
  const coverage = useMemo(() => {
    if (!registry || discoveryRows.length === 0) return null;
    const sim = simulate(discoveryRows, rules, registry);
    const enabledRules = rules.filter((r) => r.enabled).length;
    return {
      percent:
        sim.totalEvents > 0
          ? Math.round((100 * sim.matchedEvents) / sim.totalEvents)
          : 0,
      uncovered: sim.uncovered.length,
      // When every rule was skipped (detector or threshold rules cannot be evaluated from event
      // rows) the figure would read "0% covered" for a profile that is fully configured. That is
      // not a low coverage, it is no estimate, so it must not be shown as a number.
      estimable: enabledRules > 0 && sim.skippedRules.length < enabledRules,
    };
  }, [discoveryRows, rules, registry]);

  const persist = async (next: Rule[]) => {
    await saveRules(next);
    await refetch();
  };

  // Show the loading screen only for the very first load. Every save ends in a refetch, and if that
  // flipped the page back to "Loading rules..." the whole tree would unmount and lose its state
  // (open rows, search text) on every move, toggle and delete.
  if ((rulesLoading || registryLoading) && !loadedOnce.current) {
    return (
      <Flex flexDirection="column" padding={32} gap={32}>
        <Heading level={2}>Rules</Heading>
        <Flex alignItems="center" gap={8}>
          <ProgressCircle />
          <Paragraph>Loading rules...</Paragraph>
        </Flex>
      </Flex>
    );
  }

  if (rulesError || registryError || !registry) {
    return (
      <Flex flexDirection="column" padding={32} gap={32}>
        <Heading level={2}>Rules</Heading>
        <Flex alignItems="center" gap={8}>
          <CriticalIcon />
          <Paragraph>
            {rulesErrorMsg ?? "Failed to load rules or the role registry."}
          </Paragraph>
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

  return (
    <Flex flexDirection="column" padding={32} gap={32}>
      <PageHeader
        title="Rules"
        subtitle="Decide the severity each event gets: a system-wide default per event, then label-based exceptions."
        chips={[
          {
            label: `${counts.defaults} default${counts.defaults === 1 ? "" : "s"}, ${counts.exceptions} exception${counts.exceptions === 1 ? "" : "s"}`,
            tone:
              counts.defaults + counts.exceptions > 0 ? "success" : "warning",
          },
        ]}
        note={
          rules.length === 0
            ? "Start with a default: pick the event that fires most often and give it a severity."
            : undefined
        }
        action={
          rules.length > 0
            ? { label: "Go to Pipeline", to: "/pipeline" }
            : undefined
        }
      />

      {/* The tab titles already carry the default and exception counts, so only what they do not
          say is shown here: coverage of recent events, and anything switched off. */}
      {coverage?.estimable && (
        <Flex gap={12} flexWrap="wrap">
          <StatTile
            label="Recent events covered by a rule"
            value={`${coverage.percent}%`}
            tone={
              coverage.percent >= 90
                ? "good"
                : coverage.percent >= 50
                  ? "warn"
                  : "bad"
            }
          />
          <StatTile
            label="Event names with no rule"
            value={coverage.uncovered}
            tone={coverage.uncovered > 0 ? "warn" : "good"}
          />
          {counts.disabled > 0 && (
            <StatTile label="Rules switched off" value={counts.disabled} />
          )}
        </Flex>
      )}
      {coverage && !coverage.estimable && rules.length > 0 && (
        <Text>
          Coverage of recent events cannot be estimated: detector and threshold
          rules cannot be evaluated from event data.
        </Text>
      )}

      <RulesTree
        rules={rules}
        registry={registry}
        detectorName={detectorName}
        eventCatalogue={eventCatalogue}
        detectors={detectors}
        persist={persist}
      />
    </Flex>
  );
};
