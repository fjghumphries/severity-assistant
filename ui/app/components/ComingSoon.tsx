import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";

interface ComingSoonProps {
  title: string;
  phase: string;
}

/**
 * Placeholder for tabs not yet built. The full app has four tabs (Rules, Event history,
 * Pipeline, Settings) per docs/05-ui-spec.md, but they land across several phases per
 * docs/07-implementation-plan.md. This keeps the navigation shape visible from Phase 1
 * onward without pretending unbuilt functionality works.
 */
export const ComingSoon = ({ title, phase }: ComingSoonProps) => (
  <Flex flexDirection="column" padding={32} gap={8}>
    <Heading level={2}>{title}</Heading>
    <Paragraph>
      Not built yet -- planned for {phase}. See docs/07-implementation-plan.md.
    </Paragraph>
  </Flex>
);
