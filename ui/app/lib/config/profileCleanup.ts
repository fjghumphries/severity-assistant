import { stateClient } from "@dynatrace-sdk/client-state";

import { DEFAULT_PROFILE_ID, rulesKeyFor } from "./profiles";

export type CleanupResult = "deleted" | "cleared";

/** True for the "no such key" answer, which means there is nothing left to clean up. */
function isMissingKey(e: unknown): boolean {
  return /unknown key|not found/i.test((e as Error)?.message ?? "");
}

/**
 * Removes a deleted profile's stored rules so nothing is left behind in App State. Deletes the key;
 * if the platform refuses (the delete permission is not granted yet), it overwrites the rules with an
 * empty list instead -- no rule data remains either way. Never touches the default profile's rules.
 */
export async function deleteProfileRules(
  profileId: string,
): Promise<CleanupResult> {
  if (profileId === DEFAULT_PROFILE_ID)
    throw new Error("The default profile's rules are never deleted.");
  const key = rulesKeyFor(profileId);
  try {
    await stateClient.deleteAppState({ key });
    return "deleted";
  } catch (e) {
    if (isMissingKey(e)) return "deleted";
    await stateClient.setAppState({ key, body: { value: "[]" } });
    return "cleared";
  }
}

/**
 * Empties a profile's rules while keeping the profile itself -- its matcher, fallback severity and
 * pipeline stay as they are, so it can be rebuilt from scratch without being recreated. Writes an
 * empty list rather than deleting the key: the profile still exists, and this needs no delete
 * permission. Allowed for the default profile too, unlike `deleteProfileRules`.
 */
export async function clearProfileRules(profileId: string): Promise<void> {
  await stateClient.setAppState({
    key: rulesKeyFor(profileId),
    body: { value: "[]" },
  });
}
