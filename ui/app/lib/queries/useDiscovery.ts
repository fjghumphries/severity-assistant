import { useDql } from "@dynatrace-sdk/react-hooks";
import { DiscoveryRow, DiscoveryWindow } from "../types/discovery";
import { buildDiscoveryQuery } from "./discovery";

/**
 * Runs the single combined discovery query and returns its rows plus loading/error state.
 *
 * Per docs/10-phase0-results.md, this is the only query the app issues for event/role/severity
 * exploration -- everything else (event catalogue, role value pickers, match preview, coverage,
 * severity distribution) is derived from `rows` client-side. Callers should not add further
 * `useDql` calls for picker data; extend the discovery query and the `derive*` helpers instead.
 */
export function useDiscovery(window: DiscoveryWindow = "2h") {
  const query = buildDiscoveryQuery(window);
  const { data, error, isLoading, isError, refetch } =
    useDql<DiscoveryRow>(query);

  return {
    rows: data?.records ?? [],
    query,
    scannedRecords: data?.metadata?.grail?.scannedRecords,
    scannedBytes: data?.metadata?.grail?.scannedBytes,
    analysisTimeframe: data?.metadata?.grail?.analysisTimeframe,
    canonicalQuery: data?.metadata?.grail?.canonicalQuery,
    notifications: data?.metadata?.grail?.notifications,
    sampled: data?.metadata?.grail?.sampled,
    isLoading,
    isError,
    error,
    refetch,
  };
}
