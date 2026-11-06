import { stateClient } from "@dynatrace-sdk/client-state";

import { DEFAULT_PROFILE_ID, rulesKeyFor } from "./profiles";
import { REGISTRY_STATE_KEY } from "./useRegistry";

export interface ResetOutcome {
  /** Keys the platform accepted a delete for, or that were already absent. */
  deleted: string[];
  /** Keys that could not be deleted and were emptied instead (no data remains either way). */
  cleared: string[];
  /** Keys that could be neither deleted nor emptied. */
  failed: { key: string; message: string }[];
}

const isMissingKey = (e: unknown): boolean =>
  /unknown key|not found/i.test((e as Error)?.message ?? "");

/** Every App State key the app owns: the shared settings plus one rule set per profile. */
export function appStateKeys(profileIds: string[]): string[] {
  const ids = [
    DEFAULT_PROFILE_ID,
    ...profileIds.filter((id) => id !== DEFAULT_PROFILE_ID),
  ];
  return [REGISTRY_STATE_KEY, ...ids.map(rulesKeyFor)];
}

/** Forgets which profile this browser had selected, so a reset app opens clean. */
function clearLocalSelection(): void {
  try {
    window.localStorage.removeItem("severity-assistant.profile");
    window.sessionStorage.removeItem("severity-assistant.profile-gate");
  } catch {
    // Storage unavailable (private mode): nothing to forget.
  }
}

/**
 * Deletes every stored setting and rule set the app owns, returning the app to a first-run state.
 * Pipelines and routes in the tenant are NOT touched -- uninstall those first, otherwise the app
 * forgets the customIds and can no longer find them.
 *
 * Falls back to writing an empty value for any key the platform refuses to delete (the delete
 * permission may not be granted yet), so no settings survive either way.
 */
export async function resetAppState(
  profileIds: string[],
): Promise<ResetOutcome> {
  const outcome: ResetOutcome = { deleted: [], cleared: [], failed: [] };
  for (const key of appStateKeys(profileIds)) {
    try {
      await stateClient.deleteAppState({ key });
      outcome.deleted.push(key);
    } catch (e) {
      if (isMissingKey(e)) {
        outcome.deleted.push(key);
        continue;
      }
      try {
        await stateClient.setAppState({
          key,
          body: { value: key === REGISTRY_STATE_KEY ? "{}" : "[]" },
        });
        outcome.cleared.push(key);
      } catch (e2) {
        outcome.failed.push({
          key,
          message: e2 instanceof Error ? e2.message : String(e2),
        });
      }
    }
  }
  clearLocalSelection();
  return outcome;
}
