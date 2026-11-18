import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Flex } from "@dynatrace/strato-components/layouts";
import { ExternalLink, Text } from "@dynatrace/strato-components/typography";
import { Chip } from "@dynatrace/strato-components/content";
import { Select } from "@dynatrace/strato-components/forms";
import { getEnvironmentUrl } from "@dynatrace-sdk/app-environment";
import Colors from "@dynatrace/strato-design-tokens/colors";

import {
  useEffectiveRegistry,
  useProfiles,
} from "../lib/config/ProfileContext";
import { useFlowStatus } from "../lib/config/FlowStatus";
import { profileColor } from "../lib/config/profileColor";
import { APP_VERSION } from "../lib/appInfo";
import { buildIssueUrl } from "../lib/feedback/issueLink";

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
 * profile takes, and the shortcuts into the tenant's own OpenPipeline settings. It stays at the top
 * while the page scrolls and is washed in the profile's own colour, so it is always clear which
 * profile an edit or a deploy applies to.
 */
export const TopBar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { profiles, profileId, setProfileId } = useProfiles();
  const { registry } = useEffectiveRegistry();
  const matcher = registry?.routeMatcher.trim();
  const { deploy } = useFlowStatus();
  const color = profileColor(
    profileId,
    profiles.map((p) => p.id),
  );

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: `linear-gradient(${color.tint}, ${color.tint}), ${Colors.Background.Surface.Default}`,
        borderLeft: `6px solid ${color.accent}`,
        borderBottom: `1px solid ${color.accent}`,
      }}
    >
      <Flex
        alignItems="center"
        justifyContent="space-between"
        gap={24}
        flexWrap="wrap"
        paddingX={32}
        paddingY={8}
      >
        <Flex alignItems="center" gap={8}>
          <span
            style={{
              background: color.accent,
              color: "#fff",
              borderRadius: 4,
              padding: "2px 8px",
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            Profile
          </span>
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
            {matcher === "true" ? "every event" : <code>{matcher}</code>}
          </Text>
        )}

        {matcher === "true" && (
          <Chip color="warning" size="condensed">
            Takes over other routes: narrow it in{" "}
            {profileId === "default" ? "Settings" : "Profiles"}
          </Chip>
        )}

        {deploy && (
          <Chip color={deploy.tone} size="condensed">
            {deploy.label}
          </Chip>
        )}

        <Flex alignItems="center" gap={16}>
          {(["bug", "feedback"] as const).map((kind) => (
            <ExternalLink
              key={kind}
              href={buildIssueUrl(kind, {
                version: APP_VERSION,
                screen: pathname,
                userAgent: navigator.userAgent,
              })}
            >
              {kind === "bug" ? "Report a bug" : "Give feedback"}
            </ExternalLink>
          ))}
        </Flex>

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
    </div>
  );
};
