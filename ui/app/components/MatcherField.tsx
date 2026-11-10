import React, { useState } from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import { Paragraph, Text } from "@dynatrace/strato-components/typography";
import {
  Checkbox,
  Select,
  TextInput,
} from "@dynatrace/strato-components/forms";

import {
  isAllEvents,
  matcherPresetOf,
  SAFE_DEFAULT_MATCHER,
  type MatcherPreset,
} from "../lib/config/matcherPresets";

interface Props {
  value: string;
  onChange: (matcher: string) => void;
}

/**
 * "Which events does this take?" as a choice between a custom matcher (the default) and every
 * event. Taking every event is the one that surprises people: routing is first-match-wins, so other
 * routes stop receiving events. Choosing it therefore needs an explicit tick, and until the tick the
 * stored matcher does not change.
 */
export const MatcherField = ({ value, onChange }: Props) => {
  const stored = matcherPresetOf(value);
  const [choice, setChoice] = useState<MatcherPreset>(stored);
  const [understood, setUnderstood] = useState(false);

  const pick = (next: MatcherPreset) => {
    setChoice(next);
    setUnderstood(false);
    if (next === "custom" && isAllEvents(value)) onChange(SAFE_DEFAULT_MATCHER);
  };

  return (
    <Flex flexDirection="column" gap={4} style={{ minWidth: 320, flex: 1 }}>
      <Paragraph>Which events does this take? (route matcher)</Paragraph>
      <Select value={choice} onChange={(v) => v && pick(v)}>
        <Select.Content>
          <Select.Option value="custom">
            Only events matching a condition (recommended)
          </Select.Option>
          <Select.Option value="all">All Davis events</Select.Option>
        </Select.Content>
      </Select>

      {choice === "custom" ? (
        <>
          <TextInput
            value={value}
            placeholder='matchesValue(primary_tags.bu, "bu1")'
            onChange={onChange}
          />
          <Text>
            A condition on the event. Allowed functions: matchesValue,
            matchesPhrase, isNull, isNotNull. The starting value takes only
            events carrying sa.optin = true, so nothing is touched until you
            choose.
          </Text>
        </>
      ) : (
        <>
          <Text>
            Taking every Davis event means other routes, including other teams'
            pipelines, stop receiving events: routing is first-match-wins and
            this route goes first. Use a narrow condition if anything else
            routes Davis events.
          </Text>
          <Checkbox
            value={understood || isAllEvents(value)}
            onChange={(checked) => {
              setUnderstood(checked);
              if (checked) onChange("true");
              else if (isAllEvents(value)) onChange(SAFE_DEFAULT_MATCHER);
            }}
          >
            I understand other routes stop receiving events
          </Checkbox>
        </>
      )}
    </Flex>
  );
};
