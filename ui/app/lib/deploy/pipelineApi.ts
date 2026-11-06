import { settingsObjectsClient } from "@dynatrace-sdk/client-classic-environment-v2";
import { DeployPlan, isOurPipeline, LivePipeline, LivePipelineValue } from "./plan";
import type { RoutingEntry } from "./routing";

/** The Davis-events OpenPipeline pipelines schema (docs/01, `reference/phase0/`). */
export const PIPELINES_SCHEMA_ID = "builtin:openpipeline.davis.events.pipelines";

/**
 * Reads the live pipeline the app owns, identified by its `customId` (D11) -- never by display
 * name or position. Returns null when it has not been created yet. Requests `updateToken` so
 * the subsequent write is version-checked (V5): the platform rejects the PUT if anyone edited
 * the object in between, rather than silently overwriting.
 */
export async function readLivePipeline(customId: string): Promise<LivePipeline | null> {
  const result = await settingsObjectsClient.getSettingsObjects({
    schemaIds: PIPELINES_SCHEMA_ID,
    fields: "objectId,updateToken,value",
    pageSize: 500,
  });
  // Filter client-side on customId rather than trusting a server filter expression: a wrong
  // filter silently returns nothing and we would then try to create a duplicate.
  const matches = result.items.filter((item) => isOurPipeline(item.value, customId));
  if (matches.length > 1) {
    throw new Error(
      `Found ${matches.length} pipelines with customId "${customId}". Refusing to guess which one to update.`,
    );
  }
  const found = matches[0];
  if (!found) return null;
  if (!found.objectId || !found.updateToken) {
    throw new Error("The settings API returned the pipeline without an objectId/updateToken.");
  }
  return {
    objectId: found.objectId,
    updateToken: found.updateToken,
    value: found.value as LivePipelineValue,
  };
}

/** customId -> objectId of every pipeline in the tenant: one call, for status overviews. */
export async function readPipelineIndex(): Promise<Map<string, string>> {
  const result = await settingsObjectsClient.getSettingsObjects({
    schemaIds: PIPELINES_SCHEMA_ID,
    fields: "objectId,value",
    pageSize: 500,
  });
  const index = new Map<string, string>();
  for (const item of result.items) {
    const customId = (item.value as { customId?: unknown } | undefined)?.customId;
    if (item.objectId && typeof customId === "string") index.set(customId, item.objectId);
  }
  return index;
}

/** Writes the planned pipeline. Update is version-checked via the token captured at read time;
 * a concurrent edit surfaces as an error instead of being overwritten (D11.4). Does NOT touch
 * routing -- that is a separate, explicitly confirmed action (D6b). */
export async function writePipeline(plan: DeployPlan, live: LivePipeline | null): Promise<void> {
  if (plan.mode === "update") {
    if (!live) throw new Error("Update plan without a live pipeline -- re-read and re-plan.");
    await settingsObjectsClient.putSettingsObjectByObjectId({
      objectId: live.objectId,
      body: { value: plan.merged, updateToken: live.updateToken },
    });
    return;
  }
  await settingsObjectsClient.postSettingsObjects({
    body: [{ schemaId: PIPELINES_SCHEMA_ID, scope: "environment", value: plan.merged }],
  });
}

/** Restores a backed-up pipeline value. Updates the live object (version-checked) when there is
 * one, otherwise re-creates it. Replaces the whole value -- anything added since is lost. */
export async function restorePipeline(live: LivePipeline | null, value: LivePipelineValue): Promise<void> {
  if (live) {
    await settingsObjectsClient.putSettingsObjectByObjectId({
      objectId: live.objectId,
      body: { value, updateToken: live.updateToken },
    });
    return;
  }
  await settingsObjectsClient.postSettingsObjects({
    body: [{ schemaId: PIPELINES_SCHEMA_ID, scope: "environment", value }],
  });
}

/** Deletes the app's pipeline (version-checked). The caller must remove its route first: a routing
 * entry pointing at a deleted pipeline is rejected or leaves events unprocessed. */
export async function deletePipeline(live: LivePipeline): Promise<void> {
  await settingsObjectsClient.deleteSettingsObjectByObjectId({
    objectId: live.objectId,
    updateToken: live.updateToken,
  });
}

/** The Davis-events routing schema: ONE tenant-wide object holding the ordered entry list. */
export const ROUTING_SCHEMA_ID = "builtin:openpipeline.davis.events.routing";

export interface LiveRouting {
  objectId: string;
  updateToken: string;
  /** The full settings `value`, kept whole so unknown properties survive a write. */
  value: { routingEntries: RoutingEntry[]; [key: string]: unknown };
}

export async function readRouting(): Promise<LiveRouting> {
  const result = await settingsObjectsClient.getSettingsObjects({
    schemaIds: ROUTING_SCHEMA_ID,
    fields: "objectId,updateToken,value",
    pageSize: 10,
  });
  if (result.items.length !== 1) {
    throw new Error(`Expected exactly one routing settings object, found ${result.items.length}.`);
  }
  const item = result.items[0];
  const value = item.value as LiveRouting["value"] | undefined;
  if (!item.objectId || !item.updateToken || !value || !Array.isArray(value.routingEntries)) {
    throw new Error("The routing settings object came back without objectId/updateToken/routingEntries.");
  }
  return { objectId: item.objectId, updateToken: item.updateToken, value };
}

/** Version-checked write of the full routing entry list (D6b). A concurrent edit is rejected by
 * the platform rather than overwritten. */
export async function writeRouting(live: LiveRouting, entries: RoutingEntry[]): Promise<void> {
  await settingsObjectsClient.putSettingsObjectByObjectId({
    objectId: live.objectId,
    body: { value: { ...live.value, routingEntries: entries }, updateToken: live.updateToken },
  });
}

/** Turns an SDK request error into text that includes the platform's constraint violations --
 * "Schema validation failed" alone says nothing about which field was rejected. */
export function describeWriteError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const err = (e as { body?: { error?: { message?: string; constraintViolations?: { path?: string; message?: string }[] } } }).body
    ?.error;
  const violations = (err?.constraintViolations ?? []).map(
    (v) => `${v.path ? `${v.path}: ` : ""}${v.message ?? "invalid"}`,
  );
  return violations.length > 0 ? `${e.message} -- ${violations.join("; ")}` : e.message;
}

/** Restores a backed-up routing object (version-checked against the token read just before). */
export async function restoreRouting(live: LiveRouting, value: LiveRouting["value"]): Promise<void> {
  await settingsObjectsClient.putSettingsObjectByObjectId({
    objectId: live.objectId,
    body: { value, updateToken: live.updateToken },
  });
}
