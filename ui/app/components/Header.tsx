import React from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "@dynatrace/strato-components/layouts";

/** Just the app's identity. Navigation lives in the side rail, so the header no longer lists the
 * same steps a second time. */
export const Header = () => {
  return (
    <AppHeader>
      <AppHeader.Navigation>
        <AppHeader.Logo as={Link} to="/" />
      </AppHeader.Navigation>
    </AppHeader>
  );
};
