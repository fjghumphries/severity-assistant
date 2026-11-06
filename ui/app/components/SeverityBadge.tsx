import React from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Chip } from "@dynatrace/strato-components/content";

type Tone = "neutral" | "primary" | "success" | "warning" | "critical";

/** 1 is the most severe. The colour carries the meaning, so a table of severities is scannable
 * without reading every cell. */
const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  "1": { label: "1 Critical", tone: "critical" },
  "2": { label: "2 High", tone: "critical" },
  "3": { label: "3 Medium", tone: "warning" },
  "4": { label: "4 Low", tone: "primary" },
  "5": { label: "5 Info", tone: "neutral" },
};

export const severityText = (severity: string | null | undefined): string =>
  severity ? (SEVERITY[severity]?.label ?? `Severity ${severity}`) : "Not set";

/**
 * One severity, as a coloured chip. `null`/absent renders as a quiet "Not set" rather than a
 * dash, so an event that carries no severity is not mistaken for a misconfigured rule.
 */
export const SeverityBadge = ({
  severity,
}: {
  severity: string | null | undefined;
}) => {
  if (!severity) return <Text>Not set</Text>;
  const known = SEVERITY[severity];
  return (
    <Chip color={known?.tone ?? "neutral"} size="condensed">
      {known?.label ?? severity}
    </Chip>
  );
};

/** Before -> after, for a diff or a simulated change. */
export const SeverityChange = ({
  from,
  to,
}: {
  from: string | null | undefined;
  to: string | null | undefined;
}) => (
  <Flex alignItems="center" gap={4}>
    <SeverityBadge severity={from} />
    <Text>&rarr;</Text>
    <SeverityBadge severity={to} />
  </Flex>
);

/**
 * How a rule decides severity: a fixed value, or a range read from the event text. A threshold
 * rule always stores `severity: null`, so showing the bare value would render every one of them
 * as unconfigured.
 */
export const RuleSeverity = ({
  ruleType,
  severity,
  thresholdBounds,
}: {
  ruleType: string;
  severity: string | null;
  thresholdBounds: string | null;
}) => {
  if (ruleType === "threshold") {
    return (
      <Chip color="primary" size="condensed">
        {thresholdBounds
          ? `By value (${thresholdBounds})`
          : "By value (unconfigured)"}
      </Chip>
    );
  }
  return <SeverityBadge severity={severity} />;
};
