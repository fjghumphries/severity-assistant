import React from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import {
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Accordion } from "@dynatrace/strato-components/content";

import type { DeployPlan, FieldDiff } from "../../lib/deploy/plan";

const MAX_LEN = 400;

const show = (v: unknown): string => {
  if (v === undefined) return "(absent)";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > MAX_LEN
    ? `${s.slice(0, MAX_LEN)}... (${s.length} chars)`
    : s;
};

const idList = (ids: string[]) => (ids.length === 0 ? "none" : ids.join(", "));

const FieldRows = ({ fields }: { fields: FieldDiff[] }) => (
  <Flex flexDirection="column" gap={4}>
    {fields.map((f) => (
      <Flex key={f.path} flexDirection="column">
        <Strong>{f.path || "(value)"}</Strong>
        {f.before !== undefined && (
          <Text style={{ fontFamily: "monospace" }}>- {show(f.before)}</Text>
        )}
        {f.after !== undefined && (
          <Text style={{ fontFamily: "monospace" }}>+ {show(f.after)}</Text>
        )}
      </Flex>
    ))}
  </Flex>
);

/** Collapsed by default: processor ids and the raw field diff, for debugging a deploy. */
/** The processor ids and the raw field diff, as plain content (no disclosure of its own). */
export const PlanDetailsContent = ({ plan }: { plan: DeployPlan }) => (
  <Flex flexDirection="column" gap={8}>
    <Paragraph>
      <Strong>Added ({plan.added.length}):</Strong> {idList(plan.added)}
    </Paragraph>
    <Paragraph>
      <Strong>Changed ({plan.changed.length}):</Strong> {idList(plan.changed)}
    </Paragraph>
    <Paragraph>
      <Strong>Removed ({plan.removed.length}):</Strong> {idList(plan.removed)}
    </Paragraph>
    <Paragraph>
      <Strong>Unchanged:</Strong> {plan.unchangedCount}
    </Paragraph>
    <Paragraph>
      <Strong>Foreign processors preserved ({plan.foreign.length}):</Strong>{" "}
      {idList(plan.foreign.map((f) => `${f.id} (${f.stage})`))}
    </Paragraph>
    {plan.otherChanges.length > 0 && <FieldRows fields={plan.otherChanges} />}
    {plan.processorChanges.map((c) => (
      <Flex key={`${c.kind}:${c.id}`} flexDirection="column" gap={4}>
        <Strong>
          {c.kind.toUpperCase()} -- {c.id}
        </Strong>
        <FieldRows fields={c.fields} />
      </Flex>
    ))}
  </Flex>
);

/** The same content behind its own disclosure, for use on its own. */
export const PlanDetails = ({ plan }: { plan: DeployPlan }) => (
  <Accordion>
    <Accordion.Section id="technical">
      <Accordion.SectionLabel>
        Technical details (processor ids and field diff)
      </Accordion.SectionLabel>
      <Accordion.SectionContent>
        <PlanDetailsContent plan={plan} />
      </Accordion.SectionContent>
    </Accordion.Section>
  </Accordion>
);
