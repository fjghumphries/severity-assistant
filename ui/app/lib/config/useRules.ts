import { useAppState, useSetAppState } from "@dynatrace-sdk/react-hooks";
import { isNotFound } from "@dynatrace-sdk/client-state";
import { Rule } from "../types/rule";
import { useProfileId } from "./ProfileContext";
import { DEFAULT_RULES_KEY, rulesKeyFor } from "./profiles";
import { normalizeRuleRecord } from "./rulesSerialization";
import { notifyStateChanged, useRefetchOnStateChange } from "./stateEvents";

/**
 * App-wide (cross-user) state key holding the full rule set, serialised as a single JSON array.
 *
 * Originally a Grail lookup table written via `lookup:upload`, moved to App State (mirroring
 * `useRegistry.ts`) because the lookup-table write path needed an undocumented multipart API, a
 * server-side app function, AND a path-scoped IAM policy grant from a tenant admin -- friction
 * every future customer install would hit again. App State needs only the
 * `state:app-states:read`/`:write` scopes already declared for the role registry, and ~2,000
 * rules at ~500 bytes each is well inside the 10 MB per-value limit. Trade-off accepted: rules
 * are no longer queryable via DQL `load` in a Notebook -- the app's own Rules tab is the
 * intended way to inspect them.
 */
export const RULES_STATE_KEY = DEFAULT_RULES_KEY;

/** See `useRegistry.ts` -- same footgun, same fix: match "unknown key" text, not just the
 * SDK's `isNotFound` type guard, which did not reliably match a genuine 404 in testing. */
function looksLikeMissingKey(
  message: string | undefined,
  errorDetails: unknown,
): boolean {
  if (message && /unknown key/i.test(message)) return true;
  return isNotFound(errorDetails);
}

/**
 * Reads the rule set from the App State Service. Returns an empty array (not an error) when
 * nothing has been saved yet -- first-run, before `initialise` has created it.
 */
export function useRules() {
  // Rules are stored per profile; the default profile keeps the original key.
  const profileId = useProfileId();
  const { data, error, errorDetails, isSuccess, isError, refetch } =
    useAppState({
      key: rulesKeyFor(profileId),
    });
  useRefetchOnStateChange(rulesKeyFor(profileId), refetch);

  let rules: Rule[] | null = null;
  let parseError: string | null = null;
  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value) as unknown[];
      rules = parsed.map((record) =>
        normalizeRuleRecord(record as Record<string, unknown>),
      );
    } catch {
      parseError = "Stored rules are not valid JSON.";
    }
  }

  const notFound = isError && looksLikeMissingKey(error?.message, errorDetails);

  // Same "settled" pattern as useRegistry.ts: useAppState's isLoading does not reliably flip
  // false on a 404 (docs/11-known-gotchas.md), so gate on isSuccess || isError instead.
  const settled = isSuccess || isError;

  return {
    rules: rules ?? [],
    exists: rules !== null,
    isLoading: !settled,
    isError: isError && !notFound,
    error: parseError ?? error?.message,
    refetch,
  };
}

/** Writes the full rule set, replacing whatever was stored. Callers must run `validateRule`/
 * `findDuplicateRules` first -- this hook trusts its input. */
export function useSaveRules() {
  const { execute } = useSetAppState();
  const profileId = useProfileId();

  return async (rules: Rule[]) => {
    await execute({
      key: rulesKeyFor(profileId),
      body: { value: JSON.stringify(rules) },
    });
    notifyStateChanged(rulesKeyFor(profileId));
  };
}
