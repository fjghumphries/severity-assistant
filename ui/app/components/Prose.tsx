import React from "react";

import { Text } from "@dynatrace/strato-components/typography";

/** A comfortable line length for running text (roughly 80 characters). Wider and a sentence is
 * tiring to follow -- which is why prose is capped while tables, tiles and charts use the width. */
export const PROSE_WIDTH = 760;

/** Running text held to a readable measure, wherever it sits on a wide page. */
export const Prose = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ maxWidth: PROSE_WIDTH }}>{children}</Text>
);
