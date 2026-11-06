import React from "react";
import { useNavigate } from "react-router-dom";

import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Strong, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Chip } from "@dynatrace/strato-components/content";

import { PROSE_WIDTH } from "./Prose";
import type { StepState } from "./steps";

export interface PageAction {
  label: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface Props {
  title: string;
  /** One line: what this screen is for. */
  subtitle?: React.ReactNode;
  /** Status beside the title, for this page's own state (e.g. "Up to date"). */
  chips?: StepState[];
  /** The single thing to do next from here. */
  action?: PageAction;
  /** Shown under the subtitle when something needs attention first. */
  note?: React.ReactNode;
}

/** A page's title, what it is for, its status, and the one next action. The step navigation lives
 * in the side rail, so this no longer repeats it. */
export const PageHeader = ({ title, subtitle, chips, action, note }: Props) => {
  const navigate = useNavigate();
  return (
    <Flex flexDirection="column" gap={8}>
      <Flex
        justifyContent="space-between"
        alignItems="center"
        gap={16}
        flexWrap="wrap"
      >
        <Flex alignItems="center" gap={12} flexWrap="wrap">
          <Heading level={2}>{title}</Heading>
          {chips?.map((c, i) => (
            <Chip key={i} color={c.tone} size="condensed">
              {c.label}
            </Chip>
          ))}
        </Flex>
        {action && (
          <Button
            variant="accent"
            disabled={action.disabled}
            onClick={() =>
              action.onClick
                ? action.onClick()
                : action.to && navigate(action.to)
            }
          >
            {action.label}
          </Button>
        )}
      </Flex>
      {subtitle && <Text style={{ maxWidth: PROSE_WIDTH }}>{subtitle}</Text>}
      {note && (
        <Text style={{ maxWidth: PROSE_WIDTH }}>
          <Strong>{note}</Strong>
        </Text>
      )}
    </Flex>
  );
};
