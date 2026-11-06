import { useEffect, useState } from "react";
import { settingsObjectsClient } from "@dynatrace-sdk/client-classic-environment-v2";

export interface AnomalyDetectorOption {
  objectId: string;
  name: string;
}

const SCHEMA_ID = "builtin:davis.anomaly-detectors";

/**
 * Lists configured anomaly detectors (name + objectId) for the detector picker in the Rules
 * page. Object IDs are meaningless to a human but stable across edits to a detector's
 * threshold or its event.name template -- unlike event.name itself, which can bake the
 * threshold value in as a plain literal string (confirmed live in this tenant: one detector's
 * event.name template is the literal "CPU is above the static 90% threshold", not a
 * placeholder -- editing the threshold would silently desync it from any rule matching that
 * exact name). `dt.settings.object_id` on the resulting Davis event is this same objectId.
 *
 * Fetched once per page load via `settings:objects:read`, the same scope already declared for
 * reading the OpenPipeline pipeline -- no new scope needed.
 */
export function useAnomalyDetectors() {
  const [detectors, setDetectors] = useState<AnomalyDetectorOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    settingsObjectsClient
      .getSettingsObjects({
        schemaIds: SCHEMA_ID,
        fields: "objectId,summary",
        pageSize: 500,
      })
      .then((result) => {
        if (cancelled) return;
        setDetectors(
          result.items
            .filter((item): item is typeof item & { objectId: string } =>
              Boolean(item.objectId),
            )
            .map((item) => ({
              objectId: item.objectId,
              name: item.summary?.trim() || item.objectId,
            })),
        );
        setIsLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { detectors, isLoading, error };
}
