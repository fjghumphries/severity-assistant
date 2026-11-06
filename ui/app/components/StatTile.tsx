import React from "react";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";

/** What a number means, so colour carries information rather than decoration: a count of zero is
 * never "bad", and only a figure that actually calls for attention is coloured. */
export type StatTone = "neutral" | "good" | "warn" | "bad";

const TONE_COLOR: Record<StatTone, string | undefined> = {
  neutral: undefined,
  good: Colors.Text.Success.Default,
  warn: Colors.Text.Warning.Default,
  bad: Colors.Text.Critical.Default,
};

interface Props {
  label: string;
  value: number | string;
  tone?: StatTone;
  /** Opens the drilldown. The tile is inert (no pointer, no click) when `value` is 0. */
  onClick?: () => void;
}

/**
 * A compact stat: the number and its label on one line, about a third the height of the chart
 * widget it replaces. A strip of these informs without becoming the loudest thing on the screen.
 */
export const StatTile = ({
  label,
  value,
  tone = "neutral",
  onClick,
}: Props) => {
  const active = onClick !== undefined && Number(value) > 0;
  return (
    <button
      type="button"
      onClick={active ? onClick : undefined}
      aria-label={
        active ? `${label}: ${value}. Show details` : `${label}: ${value}`
      }
      style={{
        all: "unset",
        flex: "1 1 180px",
        cursor: active ? "pointer" : "default",
      }}
    >
      <Surface padding={12} elevation={active ? "raised" : "flat"}>
        <Flex alignItems="baseline" gap={12} justifyContent="space-between">
          <Text>{label}</Text>
          <Text
            textStyle="base-emphasized"
            style={{
              fontSize: 24,
              lineHeight: "28px",
              color: TONE_COLOR[tone],
            }}
          >
            {value}
          </Text>
        </Flex>
      </Surface>
    </button>
  );
};
