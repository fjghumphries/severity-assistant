import React from "react";
import { useNavigate } from "react-router-dom";

import { Flex } from "@dynatrace/strato-components/layouts";
import { ExternalLink, Text } from "@dynatrace/strato-components/typography";
import { Chip } from "@dynatrace/strato-components/content";
import { Select } from "@dynatrace/strato-components/forms";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";

import {
  useEffectiveRegistry,
  useProfiles,
} from "../lib/config/ProfileContext";
import { useFlowStatus } from "../lib/config/FlowStatus";

const NEW = "__new__";

/** Davis-events OpenPipeline pages in the tenant's Settings app (paths confirmed on a test tenant). */
const SETTINGS_PATH =
  "/ui/apps/dynatrace.settings/settings/openpipeline-davis-events";

/** Built from the environment's own URL so it is correct on any tenant, also from the dev server. */
function settingsLink(page: "dynamic-routes" | "pipelines"): string {
  try {
    return `${getEnvironmentUrl().replace(/\/$/, "")}${SETTINGS_PATH}/${page}`;
  } catch {
    return "";
  }
}

const OPENPIPELINE_LINKS = [
  { label: "OpenPipeline routing", href: settingsLink("dynamic-routes") },
  { label: "OpenPipeline pipelines", href: settingsLink("pipelines") },
].filter((l) => l.href);

/**
 * The strip above every screen, in three parts: which profile you are working on, what that
 * profile takes, and the shortcuts into the tenant's own OpenPipeline settings.
 */
export const TopBar = () => {
  const navigate = useNavigate();
  const { profiles, profileId, setProfileId } = useProfiles();
  const { registry } = useEffectiveRegistry();
  const matcher = registry?.routeMatcher.trim();
  const { deploy } = useFlowStatus();

  return (
    <Flex
      alignItems="center"
      justifyContent="space-between"
      gap={24}
      flexWrap="wrap"
      paddingX={32}
      paddingTop={16}
    >
      <Flex alignItems="center" gap={8}>
        <Text textStyle="base-emphasized">Profile:</Text>
        <Select
          value={profileId}
          onChange={(v) => {
            if (v === NEW)
              navigate("/profiles", { state: { addProfile: Date.now() } });
            else if (v) setProfileId(v);
          }}
        >
          <Select.Content>
            {profiles.map((p) => (
              <Select.Option key={p.id} value={p.id}>
                {p.name}
              </Select.Option>
            ))}
            <Select.Option value={NEW}>+ New profile...</Select.Option>
          </Select.Content>
        </Select>
      </Flex>

      {matcher !== undefined && (
        <Text>
          <Text textStyle="base-emphasized">This profile takes:</Text>{" "}
          {matcher === "true" ? "every Davis event" : <code>{matcher}</code>}
        </Text>
      )}

      {deploy && (
        <Chip color={deploy.tone} size="condensed">
          {deploy.label}
        </Chip>
      )}

      {OPENPIPELINE_LINKS.length > 0 && (
        <Flex alignItems="center" gap={16}>
          {OPENPIPELINE_LINKS.map((l) => (
            <ExternalLink key={l.label} href={l.href}>
              {l.label}
            </ExternalLink>
          ))}
        </Flex>
      )}
    </Flex>
  );
};
