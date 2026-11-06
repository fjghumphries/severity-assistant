import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { StepKey, StepState } from "../../components/steps";
import { compile } from "../compiler";
import {
  readLivePipeline,
  readPipelineIndex,
  readRouting,
} from "../deploy/pipelineApi";
import { buildDeployPlan, type LivePipeline } from "../deploy/plan";
import { describeRouteState } from "../deploy/routing";
import type { DeployKind, RouteKind } from "../deploy/nextStep";
import { useEffectiveRegistry, useProfiles } from "./ProfileContext";
import { useRules } from "./useRules";

/** Whether what is deployed matches what the saved rules and settings would compile to. */
export interface DeployState extends StepState {
  kind: DeployKind;
  /** True when a deploy is needed (or possible), so the UI can point at the Pipeline screen. */
  pending: boolean;
}

interface FlowStatusValue {
  /** What each step stands at, for the profile in use. Only what is cheap to know everywhere. */
  steps: Partial<Record<StepKey, StepState>>;
  /** Is the deployed pipeline up to date with the saved rules and settings? Null until known. */
  deploy: DeployState | null;
  /** Whether a route sends events to this profile's pipeline. Null until known. */
  route: RouteKind | null;
  /** Enabled rules in the selected profile, for deciding whether there is anything to deploy. */
  enabledRules: number;
  /** Re-read the tenant (after a deploy or a route change) so the rail does not go stale. */
  refresh: () => void;
}

const FlowStatusContext = createContext<FlowStatusValue>({
  steps: {},
  deploy: null,
  route: null,
  enabledRules: 0,
  refresh: () => {},
});

/**
 * The status shown beside each step in the side rail, for whichever profile is selected.
 *
 * Deliberately limited to what is cheap on every page: the rule count (App State), whether the
 * pipeline is deployed and routed, and whether the deployed pipeline is up to date. The last is one
 * more settings read plus a pure compile and diff, recomputed in memory whenever a rule or setting
 * changes, so a save is reflected at once without another read. The Events step has no status
 * because knowing what changed there means running the Events query, which scans gigabytes.
 */
export const FlowStatusProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { registry } = useEffectiveRegistry();
  const { profiles, profileId } = useProfiles();
  const { rules, isLoading: rulesLoading } = useRules();
  const [version, setVersion] = useState(0);
  const [tenant, setTenant] = useState<{
    pipelines: Map<string, string> | null;
    routing: { pipelineId: string; enabled: boolean; matcher: string }[] | null;
  } | null>(null);

  // undefined = not read yet, null = read and no such pipeline, otherwise the live object.
  const [live, setLive] = useState<LivePipeline | null | undefined>(undefined);
  const customId = registry?.pipelineCustomId;

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!customId) return;
    let cancelled = false;
    setLive(undefined);
    readLivePipeline(customId)
      .then((value) => {
        if (!cancelled) setLive(value);
      })
      .catch(() => {
        // Unknown is better than a wrong "up to date": leave the indicator off.
        if (!cancelled) setLive(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [customId, version]);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([readPipelineIndex(), readRouting()]).then(
      ([p, r]) => {
        if (cancelled) return;
        setTenant({
          pipelines: p.status === "fulfilled" ? p.value : null,
          routing:
            r.status === "fulfilled" ? r.value.value.routingEntries : null,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [version, profileId]);

  const steps = useMemo(() => {
    const out: Partial<Record<StepKey, StepState>> = {
      profiles: {
        label: `${profiles.length} profile${profiles.length === 1 ? "" : "s"}`,
        tone: "neutral",
      },
    };
    if (!rulesLoading) {
      const enabled = rules.filter((r) => r.enabled).length;
      out.rules = {
        label: `${enabled} rule${enabled === 1 ? "" : "s"}`,
        tone: enabled > 0 ? "success" : "warning",
      };
    }
    if (tenant?.pipelines && registry) {
      const objectId = tenant.pipelines.get(registry.pipelineCustomId);
      if (!objectId) {
        out.pipeline = { label: "Not deployed", tone: "warning" };
      } else if (tenant.routing) {
        const route = describeRouteState(
          tenant.routing.map((e) => ({
            ...e,
            description: "",
            pipelineType: "custom",
          })),
          objectId,
        ).state;
        out.pipeline =
          route === "live"
            ? { label: "Live", tone: "success" }
            : route === "shadowed"
              ? { label: "Shadowed", tone: "critical" }
              : { label: "Not routed", tone: "neutral" };
      } else {
        out.pipeline = { label: "Deployed", tone: "success" };
      }
    }
    return out;
  }, [profiles.length, rules, rulesLoading, tenant, registry]);

  const deploy = useMemo((): DeployState | null => {
    if (!registry || rulesLoading || live === undefined) return null;
    const compiled = compile(rules, registry);
    if (!compiled.ok) {
      return {
        kind: "errors",
        label: "Rules have errors",
        tone: "critical",
        pending: true,
      };
    }
    if (live === null) {
      return {
        kind: "not-deployed",
        label: "Not deployed",
        tone: "warning",
        pending: true,
      };
    }
    const plan = buildDeployPlan(compiled.pipeline, live);
    if (plan.noChange) {
      return {
        kind: "in-sync",
        label: "Deployed pipeline is up to date",
        tone: "success",
        pending: false,
      };
    }
    return {
      kind: "pending",
      label: "Changes not deployed",
      tone: "warning",
      pending: true,
    };
  }, [registry, rules, rulesLoading, live]);

  const route = useMemo((): RouteKind | null => {
    if (!registry || !tenant?.pipelines || !tenant.routing) return null;
    const objectId = tenant.pipelines.get(registry.pipelineCustomId);
    if (!objectId) return null;
    return describeRouteState(
      tenant.routing.map((e) => ({
        ...e,
        description: "",
        pipelineType: "custom",
      })),
      objectId,
    ).state;
  }, [registry, tenant]);

  const enabledRules = useMemo(
    () => rules.filter((r) => r.enabled).length,
    [rules],
  );

  const value = useMemo(
    () => ({ steps, deploy, route, enabledRules, refresh }),
    [steps, deploy, route, enabledRules, refresh],
  );
  return (
    <FlowStatusContext.Provider value={value}>
      {children}
    </FlowStatusContext.Provider>
  );
};

export const useFlowStatus = (): FlowStatusValue =>
  useContext(FlowStatusContext);
