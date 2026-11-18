import React, { useEffect, useState } from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import {
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { TextArea } from "@dynatrace/strato-components/forms";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { CriticalIcon } from "@dynatrace/strato-icons";

import {
  fetchLatestSample,
  patternShapeProblem,
  runPatternTest,
  type PatternTestResult,
} from "../../lib/queries/patternTest";

interface Props {
  pattern: string;
  sample: string;
  setSample: (s: string) => void;
  /** Where the latest description comes from: the rule's detector, else its event name. */
  eventName: string | null;
  detectorId: string | null;
  /** Called with a reason while the pattern reads nothing from the sample, else null. */
  onBlock: (reason: string | null) => void;
}

/**
 * Tests the pattern on a real description as it is typed. A pattern that reads nothing is accepted
 * by the pipeline and then silently does nothing, so while a tested sample shows "reads nothing" the
 * rule cannot be saved. With no sample the pattern is simply untested and saving stays possible.
 */
export const PatternTestPanel = ({
  pattern,
  sample,
  setSample,
  eventName,
  detectorId,
  onBlock,
}: Props) => {
  const [tested, setTested] = useState<{
    key: string;
    result: PatternTestResult;
  } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState<string | null>(null);

  const trimmed = pattern.trim();
  const key = `${trimmed}\u0000${sample}`;
  const canTest = trimmed !== "" && sample.trim() !== "";
  const current = tested?.key === key ? tested.result : null;
  const testing = canTest && current === null;

  // Test after a short pause in typing, and drop an answer that arrives for an older pattern.
  useEffect(() => {
    if (!canTest) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void runPatternTest(sample, trimmed).then((result) => {
        if (!cancelled) setTested({ key, result });
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canTest, key, sample, trimmed]);

  // A pattern without the sa_v capture is already known to be wrong, with or without a sample.
  const shape = trimmed === "" ? null : patternShapeProblem(trimmed);
  const blockReason =
    shape !== null
      ? shape
      : current && current.status !== "reads"
        ? "The pattern reads nothing from the sample description."
        : null;
  useEffect(() => {
    onBlock(blockReason);
  }, [blockReason, onBlock]);

  const loadLatest = async () => {
    setFetching(true);
    setFetchNote(null);
    try {
      const latest = await fetchLatestSample({ eventName, detectorId });
      if (latest === null) {
        setFetchNote(
          "No description from this event or detector in the last 2 hours. Paste one below.",
        );
      } else {
        setSample(latest);
      }
    } catch (e) {
      setFetchNote(
        `Could not read a recent event: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setFetching(false);
    }
  };

  const canFetch = Boolean(detectorId || eventName?.trim());

  return (
    <Flex flexDirection="column" gap={8}>
      <Paragraph>
        <Strong>Test on a real description</Strong>
      </Paragraph>
      <Flex gap={8} alignItems="center" flexWrap="wrap">
        <Button
          variant="emphasized"
          disabled={!canFetch || fetching}
          onClick={() => void loadLatest()}
        >
          {fetching ? "Looking..." : "Use the latest event"}
        </Button>
        <Text>
          {canFetch
            ? "or paste a description below."
            : "Choose an event or detector above to fetch a sample, or paste a description below."}
        </Text>
      </Flex>
      {fetchNote && <Text>{fetchNote}</Text>}
      <TextArea
        value={sample}
        onChange={setSample}
        placeholder="Paste an event description here"
        rows={3}
      />
      {testing && (
        <Flex gap={8} alignItems="center">
          <ProgressCircle size="small" />
          <Text>Testing the pattern...</Text>
        </Flex>
      )}
      {!canTest && shape === null && (
        <Text>
          Not tested yet. Use the latest event or paste a description to see
          what this pattern reads.
        </Text>
      )}
      {shape !== null && (
        <Flex gap={8} alignItems="flex-start">
          <CriticalIcon />
          <Text>{shape}</Text>
        </Flex>
      )}
      {current?.status === "reads" && (
        <Paragraph>
          <Strong>Reads {current.value}</Strong> from this description.
        </Paragraph>
      )}
      {current?.status === "nothing" && (
        <Flex flexDirection="column" gap={2}>
          <Flex gap={8} alignItems="flex-start">
            <CriticalIcon />
            <Text>
              <Strong>Reads nothing from this description.</Strong> The rule
              could not be saved like this: it would give no severity.
            </Text>
          </Flex>
          {current.hint && <Text>{current.hint}</Text>}
        </Flex>
      )}
      {current?.status === "invalid" && shape === null && (
        <Flex gap={8} alignItems="flex-start">
          <CriticalIcon />
          <Text>{current.message}</Text>
        </Flex>
      )}
    </Flex>
  );
};
