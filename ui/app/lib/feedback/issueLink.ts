import { REPO_URL } from "../appInfo";

export type FeedbackKind = "bug" | "feedback";

export interface FeedbackContext {
  version: string;
  /** The screen the user was on, e.g. "/rules". */
  screen: string;
  userAgent: string;
}

const PUBLIC_WARNING =
  "> This repository is public. Do not paste tenant URLs, event contents or anything else you would not publish.";

/**
 * A pre-filled "new issue" page on GitHub. The app never talks to GitHub and holds no token: the
 * user reviews the text, signs in and submits it themselves. Only non-identifying context is added
 * (app version, screen, browser): no tenant URL, no rule names, no event data.
 */
export function buildIssueUrl(
  kind: FeedbackKind,
  ctx: FeedbackContext,
): string {
  const context = [
    "**Context**",
    `- App version: ${ctx.version}`,
    `- Screen: ${ctx.screen}`,
    `- Browser: ${ctx.userAgent.slice(0, 200)}`,
  ].join("\n");

  const body =
    kind === "bug"
      ? [
          PUBLIC_WARNING,
          "",
          "**What happened**",
          "",
          "",
          "**What you expected**",
          "",
          "",
          "**Steps to reproduce**",
          "1. ",
          "",
          context,
        ].join("\n")
      : [
          PUBLIC_WARNING,
          "",
          "**What would make the app better?**",
          "",
          "",
          "**What were you trying to do?**",
          "",
          "",
          context,
        ].join("\n");

  const params = new URLSearchParams({
    title: kind === "bug" ? "Bug: " : "Feedback: ",
    labels: kind === "bug" ? "bug" : "enhancement",
    body,
  });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
