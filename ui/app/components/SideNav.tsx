import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Divider, Flex } from "@dynatrace/strato-components/layouts";
import { Button } from "@dynatrace/strato-components/buttons";
import { Chip } from "@dynatrace/strato-components/content";
import {
  BarChartIcon,
  GroupIcon,
  HelpIcon,
  ListIcon,
  SettingIcon,
  WorkflowIcon,
} from "@dynatrace/strato-icons";

import { useFlowStatus } from "../lib/config/FlowStatus";
import { STEPS, type StepKey, type StepState } from "./steps";

const STEP_ICON: Record<StepKey, React.ReactNode> = {
  profiles: <GroupIcon />,
  rules: <ListIcon />,
  pipeline: <WorkflowIcon />,
  results: <BarChartIcon />,
};

/**
 * One navigation row: the name on the left, where it stands on the right, both inside the one
 * clickable item. Putting the status in its own row beneath made it read as belonging to the next
 * item down.
 */
const NavItem = ({
  icon,
  label,
  state,
  current,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  state?: StepState;
  current: boolean;
  onClick: () => void;
}) => (
  <Button
    width="full"
    variant={current ? "accent" : "default"}
    aria-current={current ? "page" : undefined}
    onClick={onClick}
  >
    <Flex
      alignItems="center"
      justifyContent="space-between"
      gap={8}
      style={{ width: "100%" }}
    >
      <Flex alignItems="center" gap={8}>
        {icon}
        <span style={{ textAlign: "left", whiteSpace: "nowrap" }}>{label}</span>
      </Flex>
      {state && (
        <Chip color={state.tone} size="condensed">
          {state.label}
        </Chip>
      )}
    </Flex>
  </Button>
);

/**
 * The one place the app's structure is shown: Getting started, the four steps in order, each with where it stands,
 * then Settings; Getting started sits above the steps. It replaces both the header items and the per-page stepper, which listed
 * the same four steps twice.
 */
export const SideNav = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { steps } = useFlowStatus();

  return (
    <Flex
      flexDirection="column"
      gap={8}
      padding={16}
      as="nav"
      aria-label="Steps"
    >
      <NavItem
        icon={<HelpIcon />}
        label="Help"
        current={pathname.startsWith("/help")}
        onClick={() => navigate("/help")}
      />

      <Divider />

      {STEPS.map((s) => (
        <NavItem
          key={s.key}
          icon={STEP_ICON[s.key]}
          label={s.title}
          state={steps[s.key]}
          current={pathname.startsWith(s.path)}
          onClick={() => navigate(s.path)}
        />
      ))}

      <Divider />

      <NavItem
        icon={<SettingIcon />}
        label="Settings"
        current={pathname.startsWith("/settings")}
        onClick={() => navigate("/settings")}
      />
    </Flex>
  );
};
