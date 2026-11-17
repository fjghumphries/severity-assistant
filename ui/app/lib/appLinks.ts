import { getAppId, getEnvironmentUrl } from "@dynatrace-sdk/app-environment";

/** `<environment>/ui/apps/<app id>/<route>`: the address of one of this app's screens in the
 * platform, the same shape as the links into other apps (e.g. the Settings app). Pure. */
export function buildAppUrl(
  environmentUrl: string,
  appId: string,
  route: string,
): string {
  const path = route.startsWith("/") ? route : `/${route}`;
  return `${environmentUrl.replace(/\/$/, "")}/ui/apps/${appId}${path}`;
}

/** The platform address of a screen of this app, for opening it in a new tab. Empty when the app
 * runs outside the platform (tests, some dev setups): the caller then falls back to a router path. */
export function appUrl(route: string): string {
  try {
    return buildAppUrl(getEnvironmentUrl(), getAppId(), route);
  } catch {
    return "";
  }
}
