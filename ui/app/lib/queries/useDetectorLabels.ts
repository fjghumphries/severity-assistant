import { useEffect, useMemo, useState } from "react";
import { settingsObjectsClient } from "@dynatrace-sdk/client-classic-environment-v2";

import { fallbackDetectorLabel } from "./detectorLabels";

/** objectId -> display name, shared across renders so each id is fetched at most once. */
const resolved = new Map<string, string>();
const MAX_LOOKUPS = 300;
const CONCURRENCY = 8;

/**
 * Returns a lookup from a `dt.settings.object_id` to a human-readable name. Names come from the
 * settings object's `summary`; until resolved (or if it cannot be read) a label decoded from the
 * id itself is returned, so the UI never shows the raw base64 id.
 */
export function useDetectorLabels(ids: string[]): (id: string) => string {
  const [version, setVersion] = useState(0);
  const key = useMemo(() => [...new Set(ids)].sort().join("|"), [ids]);

  useEffect(() => {
    const todo = key
      .split("|")
      .filter((id) => id && !resolved.has(id))
      .slice(0, MAX_LOOKUPS);
    if (todo.length === 0) return;
    let cancelled = false;

    const run = async () => {
      const queue = [...todo];
      const worker = async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          try {
            const obj = await settingsObjectsClient.getSettingsObjectByObjectId(
              { objectId: id },
            );
            const name = obj.summary?.trim();
            resolved.set(id, name ? name : fallbackDetectorLabel(id));
          } catch {
            // Not readable (deleted, no permission): keep the decoded label.
            resolved.set(id, fallbackDetectorLabel(id));
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (!cancelled) setVersion((v) => v + 1);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return useMemo(
    () => (id: string) => resolved.get(id) ?? fallbackDetectorLabel(id),
    // `version` changes when lookups complete so consumers recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );
}
