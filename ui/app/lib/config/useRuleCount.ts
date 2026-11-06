import { useAppState } from "@dynatrace-sdk/react-hooks";

import { rulesKeyFor } from "./profiles";

/**
 * How many rules one profile has stored, and how many of those are enabled. `null` while the read
 * is in flight; zero for a profile that has never been saved (a missing key is the first-run state,
 * not an error).
 */
export function useRuleCount(
  profileId: string,
): { total: number; enabled: number } | null {
  const { data, isSuccess, isError } = useAppState({
    key: rulesKeyFor(profileId),
  });
  if (isError) return { total: 0, enabled: 0 };
  if (!isSuccess) return null;
  try {
    const rules = JSON.parse(data?.value ?? "[]") as { enabled?: boolean }[];
    return {
      total: rules.length,
      enabled: rules.filter((r) => r.enabled !== false).length,
    };
  } catch {
    return { total: 0, enabled: 0 };
  }
}
