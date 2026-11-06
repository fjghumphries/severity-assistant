/**
 * What the user still has to do before their saved rules actually affect events, as one notice with
 * one next action. Pure: the banner (components/DeployBanner.tsx) only renders what this returns.
 *
 * The order matters. Rules that cannot compile block everything after them; undeployed changes come
 * before routing because a route to a stale pipeline is the more misleading state.
 */

/** How the deployed pipeline compares with what the saved rules and settings compile to. */
export type DeployKind = "errors" | "not-deployed" | "pending" | "in-sync";

export type RouteKind = "absent" | "disabled" | "shadowed" | "live";

export interface NextStepInput {
  /** Null until the live pipeline has been read, so the banner never flashes a wrong state. */
  kind: DeployKind | null;
  route: RouteKind | null;
  enabledRules: number;
}

export interface NextStep {
  tone: "warning" | "critical";
  title: string;
  body: string;
  action: { label: string; to: string };
}

export function nextStep(i: NextStepInput): NextStep | null {
  if (i.kind === null) return null;

  if (i.kind === "errors") {
    return {
      tone: "critical",
      title: "Your rules cannot be deployed yet",
      body: "A rule or setting is invalid, so nothing can be deployed. Fix it on the Rules screen.",
      action: { label: "Go to Rules", to: "/rules" },
    };
  }

  if (i.kind === "not-deployed") {
    // An empty profile has nothing to deploy; nagging a new user would be noise.
    if (i.enabledRules === 0) return null;
    return {
      tone: "warning",
      title: "Your rules are saved but not active",
      body: "Nothing is deployed yet, so no event is affected. Deploy the pipeline, then enable its route.",
      action: { label: "Go to Pipeline", to: "/pipeline" },
    };
  }

  if (i.kind === "pending") {
    return {
      tone: "warning",
      title: "You have changes that are not active yet",
      body: "They are saved, but events keep using the pipeline as it was last deployed until you deploy again.",
      action: { label: "Review and deploy", to: "/pipeline" },
    };
  }

  // Deployed and up to date: the only thing left is whether events can reach it.
  if (i.route === "absent" || i.route === "disabled") {
    return {
      tone: "warning",
      title: "The pipeline is deployed, but no route sends events to it",
      body: "Until its route is enabled the pipeline does nothing.",
      action: { label: "Enable the route", to: "/pipeline" },
    };
  }
  if (i.route === "shadowed") {
    return {
      tone: "critical",
      title: "Another route is taking these events first",
      body: "A route above this profile's matches the same events, so this pipeline receives nothing.",
      action: { label: "Open the Pipeline screen", to: "/pipeline" },
    };
  }
  return null;
}
