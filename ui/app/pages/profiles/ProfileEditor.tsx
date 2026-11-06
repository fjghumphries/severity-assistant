import React from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import { Paragraph, Text } from "@dynatrace/strato-components/typography";
import { Select, TextInput } from "@dynatrace/strato-components/forms";

import type { Profile } from "../../lib/types/registry";

interface Props {
  profile: Profile;
  onChange: (patch: Partial<Profile>) => void;
}

/** The per-profile settings: matcher, fallback severity and security context. */
export const ProfileEditor = ({ profile: p, onChange }: Props) => (
  <Flex gap={24} flexWrap="wrap">
    <Flex flexDirection="column" gap={2} style={{ minWidth: 320, flex: 1 }}>
      <Paragraph>Route matcher (required)</Paragraph>
      <TextInput
        value={p.routeMatcher}
        placeholder='matchesValue(primary_tags.bu, "bu1")'
        onChange={(value) => onChange({ routeMatcher: value })}
      />
      <Text>
        Which Davis events this profile takes. Allowed functions: matchesValue,
        matchesPhrase, isNull, isNotNull.
      </Text>
    </Flex>

    <Flex flexDirection="column" gap={2} style={{ minWidth: 220 }}>
      <Paragraph>When no rule matches</Paragraph>
      <Select
        value={p.defaultSeverity.mode}
        onChange={(value) =>
          value &&
          onChange({
            defaultSeverity: { mode: value, value: p.defaultSeverity.value },
          })
        }
      >
        <Select.Content>
          <Select.Option value="leave">Leave severity untouched</Select.Option>
          <Select.Option value="set">Set a default severity</Select.Option>
          <Select.Option value="flag">Set a default and flag it</Select.Option>
        </Select.Content>
      </Select>
    </Flex>

    {p.defaultSeverity.mode !== "leave" && (
      <Flex flexDirection="column" gap={2} style={{ minWidth: 120 }}>
        <Paragraph>Default severity (1-5)</Paragraph>
        <TextInput
          value={p.defaultSeverity.value ?? ""}
          onChange={(value) =>
            onChange({ defaultSeverity: { ...p.defaultSeverity, value } })
          }
        />
      </Flex>
    )}

    <Flex flexDirection="column" gap={2} style={{ minWidth: 220 }}>
      <Paragraph>Security context (dt.security_context)</Paragraph>
      <Select
        value={p.securityContext?.mode ?? "none"}
        onChange={(value) =>
          value &&
          onChange({
            securityContext: { mode: value, value: p.securityContext?.value },
          })
        }
      >
        <Select.Content>
          <Select.Option value="none">Do not set (leave as is)</Select.Option>
          <Select.Option value="field">Copy from an event field</Select.Option>
          <Select.Option value="constant">Set a fixed value</Select.Option>
        </Select.Content>
      </Select>
    </Flex>

    {p.securityContext && p.securityContext.mode !== "none" && (
      <Flex flexDirection="column" gap={2} style={{ minWidth: 240 }}>
        <Paragraph>
          {p.securityContext.mode === "field" ? "Event field" : "Value"}
        </Paragraph>
        <TextInput
          value={p.securityContext.value ?? ""}
          onChange={(value) =>
            onChange({
              securityContext: {
                mode: p.securityContext?.mode ?? "field",
                value,
              },
            })
          }
        />
      </Flex>
    )}
  </Flex>
);
