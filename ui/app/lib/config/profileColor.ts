import { DEFAULT_PROFILE_ID } from "./profiles";

/** Hues for the non-default profiles, chosen to stay apart from each other and from the default's
 * blue. Assigned by position in the profile list, so two profiles never share a colour until there
 * are more profiles than hues. */
const HUES = [155, 28, 285, 335, 185, 52];
const DEFAULT_HUE = 215;

export interface ProfileColor {
  /** Solid colour for borders and labels; dark enough for white text. */
  accent: string;
  /** Translucent colour for a background wash; layer it over an opaque surface. */
  tint: string;
}

/** A stable colour for a profile, so the one being worked on is recognisable at a glance. */
export function profileColor(
  profileId: string,
  profileIds: string[],
): ProfileColor {
  let hue = DEFAULT_HUE;
  if (profileId !== DEFAULT_PROFILE_ID) {
    const others = profileIds.filter((id) => id !== DEFAULT_PROFILE_ID);
    const index = Math.max(0, others.indexOf(profileId));
    hue = HUES[index % HUES.length];
  }
  return {
    accent: `hsl(${hue} 65% 38%)`,
    tint: `hsl(${hue} 80% 50% / 0.14)`,
  };
}
