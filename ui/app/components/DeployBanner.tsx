import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Flex } from "@dynatrace/strato-components/layouts";
import { Button } from "@dynatrace/strato-components/buttons";
import { MessageContainer } from "@dynatrace/strato-components/content";

import { useFlowStatus } from "../lib/config/FlowStatus";
import { nextStep } from "../lib/deploy/nextStep";

/**
 * Tells the user what is still unfinished before their saved rules affect any event, and the one
 * thing to do about it. Shown on every screen except Pipeline, where the deploy and route controls
 * are already in front of them. See lib/deploy/nextStep.ts for the cases.
 */
export const DeployBanner = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { deploy, route, enabledRules } = useFlowStatus();

  if (pathname === "/pipeline") return null;
  const step = nextStep({
    kind: deploy?.kind ?? null,
    route,
    enabledRules,
  });
  if (!step) return null;

  return (
    <Flex paddingX={32} paddingTop={16}>
      <MessageContainer variant={step.tone} style={{ width: "100%" }}>
        <MessageContainer.Title>{step.title}</MessageContainer.Title>
        <MessageContainer.Description>{step.body}</MessageContainer.Description>
        <MessageContainer.Actions>
          <Button variant="accent" onClick={() => navigate(step.action.to)}>
            {step.action.label}
          </Button>
        </MessageContainer.Actions>
      </MessageContainer>
    </Flex>
  );
};
