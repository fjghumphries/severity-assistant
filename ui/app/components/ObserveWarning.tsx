import React from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import { Strong, Text } from "@dynatrace/strato-components/typography";
import { CriticalIcon } from "@dynatrace/strato-icons";

/** Shown whenever Observe is the selected mode. Observe leaves event.severity alone, so on a profile
 * that is already live it would silently switch its working rules off. */
export const ObserveWarning = () => (
  <Flex alignItems="flex-start" gap={8} style={{ maxWidth: 520 }}>
    <CriticalIcon />
    <Text>
      <Strong>Meant for the first go-live of a profile.</Strong> While Observe
      is on, this profile does not change event.severity, so any rules already
      live stop applying. Switch back to Live once you have compared the
      results.
    </Text>
  </Flex>
);
