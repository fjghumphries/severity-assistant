import { useEffect, useRef } from "react";

/**
 * `useAppState` is a plain fetch-on-mount hook, not a shared cache: a component that stays mounted
 * (the status provider at the app root, for one) keeps whatever it read first and never learns that
 * another screen saved something. Every save therefore announces the App State key it wrote, and
 * every reader of that key refetches. Without this, the deploy banner would go on describing the
 * state from before the user's last save.
 */
const EVENT = "sa-state-changed";

export function notifyStateChanged(key: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: key }));
  }
}

export function useRefetchOnStateChange(
  key: string,
  refetch: () => unknown,
): void {
  const latest = useRef(refetch);
  useEffect(() => {
    latest.current = refetch;
  });
  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) void latest.current();
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [key]);
}
