import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Paragraph, Strong } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";

import { needsSetup } from "../lib/config/firstRun";
import { useSharedRegistry } from "../lib/config/ProfileContext";

/** Shown on every screen while no label is usable, so skipping setup is safe: it says what is
 * missing and how to finish, and goes away by itself once labels are saved. Derived from stored
 * data, not from a "setup finished" flag, so partial setups and returning later both work. */
export const SetupBanner = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { registry } = useSharedRegistry();
  if (pathname.startsWith("/setup") || !needsSetup(registry)) return null;
  return (
    <Surface padding={16} style={{ margin: "16px 32px 0" }}>
      <Flex
        alignItems="center"
        justifyContent="space-between"
        gap={12}
        flexWrap="wrap"
      >
        <Paragraph>
          <Strong>Setup is not finished.</Strong> Rules cannot match on labels
          until you say which fields hold them. It takes a minute.
        </Paragraph>
        <Button variant="accent" onClick={() => navigate("/setup")}>
          Finish setup
        </Button>
      </Flex>
    </Surface>
  );
};
