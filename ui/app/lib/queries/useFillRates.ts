import { useEffect, useMemo, useState } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";

import { buildFillRateQuery, probeFields, readFillRates } from "./fillRate";

/**
 * Fill rate of every field the user has mapped, from one small query over the last 2 hours. The
 * field list is debounced, so typing a field name does not run a query per keystroke.
 */
export function useFillRates(fields: string[]) {
  const key = probeFields(fields).join("\n");
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setSettled(key), 800);
    return () => clearTimeout(t);
  }, [key]);

  const query = useMemo(
    () => buildFillRateQuery(settled === "" ? [] : settled.split("\n")),
    [settled],
  );
  const { data, isLoading, isError } = useDql(
    query ?? "data record(total = 0)",
    { enabled: query !== null },
  );

  const rates = useMemo(
    () =>
      query === null
        ? {}
        : readFillRates(
            settled.split("\n"),
            data?.records?.[0] as Record<string, unknown> | undefined,
          ),
    [query, settled, data],
  );
  return {
    rates,
    /** True while the field list is changing or the query is running. */
    isLoading: settled !== key || (query !== null && isLoading),
    isError,
  };
}
