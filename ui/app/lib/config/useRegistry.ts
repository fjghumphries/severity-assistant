import { useAppState, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { isNotFound, stateClient } from "@dynatrace-sdk/client-state";
import { emptyRegistry, Profile, RoleRegistry } from "../types/registry";
import { notifyStateChanged, useRefetchOnStateChange } from "./stateEvents";

/**
 * `isNotFound(errorDetails)` from the client-state SDK does not reliably match the error
 * this hook actually surfaces for a missing key (confirmed empirically: rawIsError=true,
 * message="Unknown key: <key>", yet isNotFound() returned false). Grail's State Service uses
 * a stable "Unknown key: ..." message for exactly this case, so match on that as the primary
 * signal and keep the SDK type-guard as a secondary check.
 */
function looksLikeMissingKey(
  message: string | undefined,
  errorDetails: unknown,
): boolean {
  if (message && /unknown key/i.test(message)) return true;
  return isNotFound(errorDetails);
}

/** App-wide (cross-user) state key holding the serialized role registry. */
export const REGISTRY_STATE_KEY = "severity-assistant.role-registry.v1";

/**
 * Reads the role registry from the App State Service. Returns `emptyRegistry()` (not an
 * error) when nothing has been saved yet -- this is the expected first-run state, handled by
 * the Initialise flow rather than treated as a failure. A malformed stored value (should not
 * happen outside manual tampering) is also treated as absent rather than crashing the app.
 */
export function useRegistry() {
  const { data, error, errorDetails, isSuccess, isError, refetch } =
    useAppState({
      key: REGISTRY_STATE_KEY,
    });
  useRefetchOnStateChange(REGISTRY_STATE_KEY, refetch);

  let registry: RoleRegistry | null = null;
  let parseError: string | null = null;
  if (data?.value) {
    try {
      registry = JSON.parse(data.value) as RoleRegistry;
    } catch {
      parseError = "Stored role registry is not valid JSON.";
    }
  }

  const notFound = isError && looksLikeMissingKey(error?.message, errorDetails);

  // `isLoading` on this hook has been observed to stay true after a 404 resolves (it does not
  // reliably flip false on error, unlike the discriminated-union shape `useDql` returns) --
  // so treat the request as settled once we have EITHER a success OR any error, rather than
  // trusting the raw isLoading flag. Otherwise a permanent 404 (e.g. first run, before the
  // registry has ever been saved) leaves the UI stuck on a loading spinner forever.
  const settled = isSuccess || isError;

  return {
    registry: registry ?? (notFound ? emptyRegistry() : null),
    exists: registry !== null,
    isLoading: !settled,
    isError: isError && !notFound,
    error: parseError ?? error?.message,
    refetch,
  };
}

/** The registry as currently stored (not the possibly stale copy a screen loaded earlier). */
async function readStoredRegistry(): Promise<RoleRegistry | null> {
  try {
    const stored = await stateClient.getAppState({ key: REGISTRY_STATE_KEY });
    return stored.value ? (JSON.parse(stored.value) as RoleRegistry) : null;
  } catch (e) {
    if (looksLikeMissingKey((e as Error).message, e)) return null;
    throw e;
  }
}

/**
 * Writes the shared settings (Settings screen). Profiles live in the same stored object but are
 * edited on the Profiles screen, so they are taken from what is stored *now*: a Settings draft
 * loaded earlier must never overwrite a profile saved in the meantime. Callers must run
 * `validateRegistry` first.
 */
export function useSaveRegistry() {
  const { execute } = useSetAppState();

  return async (registry: RoleRegistry) => {
    const stored = await readStoredRegistry();
    const next: RoleRegistry = {
      ...registry,
      profiles: stored?.profiles ?? registry.profiles,
    };
    await execute({
      key: REGISTRY_STATE_KEY,
      body: { value: JSON.stringify(next) },
    });
    notifyStateChanged(REGISTRY_STATE_KEY);
  };
}

/** Writes only the profiles (Profiles screen), on top of whatever is stored now, so shared
 * settings changed elsewhere are kept. */
export function useSaveProfiles() {
  const { execute } = useSetAppState();

  return async (profiles: Profile[]) => {
    const base = (await readStoredRegistry()) ?? emptyRegistry();
    await execute({
      key: REGISTRY_STATE_KEY,
      body: { value: JSON.stringify({ ...base, profiles }) },
    });
    notifyStateChanged(REGISTRY_STATE_KEY);
  };
}
