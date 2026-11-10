import { stateClient } from "@dynatrace-sdk/client-state";

import type { RoleRegistry } from "../types/registry";
import type { ProfileRules } from "./labelImpact";
import { listProfiles, rulesKeyFor } from "./profiles";
import { normalizeRuleRecord } from "./rulesSerialization";

/** Reads every profile's stored rules (a missing key counts as no rules). */
export async function readAllRules(
  registry: RoleRegistry,
): Promise<ProfileRules[]> {
  return Promise.all(
    listProfiles(registry).map(async (p) => {
      try {
        const res = await stateClient.getAppState({ key: rulesKeyFor(p.id) });
        const parsed = JSON.parse(res.value || "[]") as Record<
          string,
          unknown
        >[];
        return {
          profileId: p.id,
          profileName: p.name,
          rules: parsed.map(normalizeRuleRecord),
        };
      } catch {
        return { profileId: p.id, profileName: p.name, rules: [] };
      }
    }),
  );
}
