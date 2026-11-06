import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import type { RoleRegistry } from "../types/registry";
import {
  DEFAULT_PROFILE_ID,
  effectiveRegistry,
  listProfiles,
  ProfileSummary,
  resolveProfileId,
} from "./profiles";
import { useRegistry } from "./useRegistry";

const STORAGE_KEY = "severity-assistant.profile";

type RegistryState = ReturnType<typeof useRegistry>;

interface ProfileContextValue {
  requestedId: string;
  setRequestedId: (id: string) => void;
  /** One shared read of the registry for everything profile-related (the switcher, the bar, the
   * Profiles tab), so a save on one screen is seen by the others after a refetch. */
  registryState: RegistryState;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

function useCtx(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("ProfileProvider is missing: wrap the app in it.");
  return ctx;
}

function readStored(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_PROFILE_ID;
  } catch {
    return DEFAULT_PROFILE_ID;
  }
}

/** Holds which profile the user is working on; shared by every tab so Rules, Pipeline and
 * Events always refer to the same one. Remembered across reloads. */
export const ProfileProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const registryState = useRegistry();
  const [requestedId, setState] = useState<string>(readStored);
  const setRequestedId = useCallback((id: string) => {
    setState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Not persisted (private mode): the selection still works for this session.
    }
  }, []);
  const value = useMemo(
    () => ({ requestedId, setRequestedId, registryState }),
    [requestedId, setRequestedId, registryState],
  );
  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
};

/** The shared registry read (same shape as `useRegistry`), for screens that must stay in sync
 * with the profile switcher. */
export function useSharedRegistry(): RegistryState {
  return useCtx().registryState;
}

/** The profile id in use: the selected one if it still exists, otherwise the default. */
export function useProfileId(): string {
  const { requestedId, registryState } = useCtx();
  return resolveProfileId(registryState.registry, requestedId);
}

export function useProfiles(): {
  profiles: ProfileSummary[];
  profileId: string;
  profile: ProfileSummary;
  setProfileId: (id: string) => void;
} {
  const { setRequestedId, registryState } = useCtx();
  const profileId = useProfileId();
  const profiles = useMemo(
    () => listProfiles(registryState.registry),
    [registryState.registry],
  );
  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0];
  return { profiles, profileId, profile, setProfileId: setRequestedId };
}

/** Like `useRegistry`, but with the selected profile's pipeline id, matcher, fallback and
 * security context applied -- what the compiler, planner and route code should be given. */
export function useEffectiveRegistry() {
  const result = useSharedRegistry();
  const profileId = useProfileId();
  const registry: RoleRegistry | null = useMemo(
    () =>
      result.registry ? effectiveRegistry(result.registry, profileId) : null,
    [result.registry, profileId],
  );
  return { ...result, registry };
}
