import React from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import { Paragraph } from "@dynatrace/strato-components/typography";
import { PROSE_WIDTH } from "./Prose";
import { InformationOverlay } from "@dynatrace/strato-components/content";

/** The detail behind a short statement: an info icon that opens the longer explanation, so pages
 * stay scannable and the full text is still one click away. */
export const HelpTip = ({
  children,
  label = "Details",
}: {
  children: React.ReactNode;
  label?: string;
}) => (
  <InformationOverlay placement="bottom">
    <InformationOverlay.Trigger>{label}</InformationOverlay.Trigger>
    <InformationOverlay.Content>
      <Flex flexDirection="column" gap={8} style={{ maxWidth: 440 }}>
        <Paragraph>{children}</Paragraph>
      </Flex>
    </InformationOverlay.Content>
  </InformationOverlay>
);

/** One short line, with the longer explanation behind an info icon. */
export const Intro = ({
  children,
  tip,
}: {
  children: React.ReactNode;
  tip?: React.ReactNode;
}) => (
  <Flex alignItems="center" gap={8} flexWrap="wrap">
    <Paragraph style={{ maxWidth: PROSE_WIDTH }}>{children}</Paragraph>
    {tip && <HelpTip>{tip}</HelpTip>}
  </Flex>
);
