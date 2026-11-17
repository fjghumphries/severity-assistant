import React from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import {
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";

import { PROSE_WIDTH } from "./Prose";

/**
 * What labels are, in plain words, for the first place a user meets them (Setup) and the place they
 * are edited (Settings). Visible text rather than a tooltip: the whole app depends on this idea.
 */
export const LabelsExplainer = () => (
  <Flex flexDirection="column" gap={8} style={{ maxWidth: PROSE_WIDTH }}>
    <Paragraph>
      <Strong>Labels</Strong> are the business facts that decide how severe an
      event should be: who owns it, which application it belongs to, how
      important that application is. A rule can say &quot;CPU saturation is
      severity 1 when Tier = gold&quot;, so the same event gets a different
      severity depending on its labels.
    </Paragraph>
    <Paragraph>
      In most tenants these facts already exist as <Strong>primary tags</Strong>{" "}
      on your events (fields such as <code>primary_tags.tier</code>). Map each
      label to the field that holds its value. Use whatever fits your
      organisation: a business unit, an application name, a tier, a team, an
      environment. The four suggested labels are only a starting point; you can
      rename them or add your own (for example Team) in Settings.
    </Paragraph>
    <Text>
      Labels are optional for rules, which give an event one severity for
      everyone. You need them only for exceptions, which override a rule for
      events carrying particular label values. Fill rate shows how many recent
      events carry the field: a low value means rules on that label will rarely
      match.
    </Text>
  </Flex>
);
