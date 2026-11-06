import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { TextInput } from "@dynatrace/strato-components/forms";
import { Chip, ProgressCircle } from "@dynatrace/strato-components/content";
import { Modal } from "@dynatrace/strato-components/overlays";
import { type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { CriticalIcon } from "@dynatrace/strato-icons";

import { useProfiles, useSharedRegistry } from "../lib/config/ProfileContext";
import { DEFAULT_PROFILE_ID, removedProfileIds } from "../lib/config/profiles";
import { deleteProfileRules } from "../lib/config/profileCleanup";
import { useRuleCount } from "../lib/config/useRuleCount";
import { useSaveProfiles } from "../lib/config/useRegistry";
import { SaveBar } from "../components/SaveBar";
import { validateRegistry } from "../lib/config/validateRegistry";
import { readPipelineIndex, readRouting } from "../lib/deploy/pipelineApi";
import { describeRouteState } from "../lib/deploy/routing";
import type { Profile } from "../lib/types/registry";
import { HelpTip } from "../components/HelpTip";
import { PageHeader } from "../components/PageHeader";
import { useFlowStatus } from "../lib/config/FlowStatus";
import { NewProfileWizard } from "./profiles/NewProfileWizard";
import { ProfileEditor } from "./profiles/ProfileEditor";
import { AppTable } from "../components/AppTable";

type RouteState = "absent" | "disabled" | "shadowed" | "live";

interface Status {
  /** customId -> objectId of deployed pipelines; null while loading or unreadable. */
  pipelines: Map<string, string> | null;
  routing: { pipelineId: string; enabled: boolean; matcher: string }[] | null;
}

/** One row of the table: the profile as drafted, plus whatever the tenant says about it. */
interface Row {
  id: string;
  name: string;
  isDefault: boolean;
  routeMatcher: string;
  pipelineCustomId: string;
  active: boolean;
  unsaved: boolean;
}

/** Its own component so the per-profile state read is a plain hook call per row. */
const RuleCountCell = ({ profileId }: { profileId: string }) => {
  const count = useRuleCount(profileId);
  return (
    <Text>
      {count === null
        ? "..."
        : `${count.enabled} rule${count.enabled === 1 ? "" : "s"}`}
    </Text>
  );
};

interface RemoveDialogProps {
  profile: Profile | null;
  deployed: boolean;
  checked: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirms removing a profile, and blocks it while its pipeline is still deployed so a managed
 * pipeline is never orphaned in the tenant. */
const RemoveDialog = ({
  profile,
  deployed,
  checked,
  onConfirm,
  onCancel,
}: RemoveDialogProps) => {
  const ruleCount =
    useRuleCount(profile?.id ?? DEFAULT_PROFILE_ID)?.total ?? null;
  return (
    <Modal
      title={`Remove profile "${profile?.name ?? ""}"?`}
      show={profile !== null}
      size="small"
      onDismiss={onCancel}
      footer={
        <Flex gap={8}>
          <Button
            variant="accent"
            color="critical"
            disabled={deployed}
            onClick={onConfirm}
          >
            Remove profile
          </Button>
          <Button variant="emphasized" onClick={onCancel}>
            Cancel
          </Button>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={12}>
        <Text>
          Removing it deletes its {ruleCount ?? "stored"} rule
          {ruleCount === 1 ? "" : "s"} from the app when you click Save
          profiles. This cannot be undone.
        </Text>
        {deployed && (
          <Flex gap={8} alignItems="center">
            <CriticalIcon />
            <Text>
              Its pipeline is still deployed in the tenant. Open the profile, go
              to Pipeline and use Uninstall first, so no pipeline or route is
              left behind.
            </Text>
          </Flex>
        )}
        {!deployed && !checked && (
          <Text>
            Could not check whether its pipeline is still deployed: make sure it
            is uninstalled.
          </Text>
        )}
      </Flex>
    </Modal>
  );
};

/** Choose, create and configure profiles. The default profile's settings stay on the Settings tab. */
export const Profiles = () => {
  const navigate = useNavigate();
  const { registry, isLoading, isError, error, refetch } = useSharedRegistry();
  const location = useLocation();
  const { profileId, setProfileId } = useProfiles();
  const { refresh: refreshFlowStatus } = useFlowStatus();
  const saveProfiles = useSaveProfiles();

  const [draft, setDraft] = useState<Profile[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cleanupNote, setCleanupNote] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({
    pipelines: null,
    routing: null,
  });

  useEffect(() => {
    if (draft === null && registry) setDraft(registry.profiles ?? []);
  }, [registry, draft]);

  // "+ New profile..." in the top bar lands here and opens the wizard.
  const [wizardOpen, setWizardOpen] = useState(false);
  const addRequest = (location.state as { addProfile?: number } | null)
    ?.addProfile;
  useEffect(() => {
    if (addRequest === undefined) return;
    setWizardOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [addRequest, navigate, location.pathname]);

  const loadStatus = useCallback(async () => {
    const [pipelines, routing] = await Promise.allSettled([
      readPipelineIndex(),
      readRouting(),
    ]);
    setStatus({
      pipelines: pipelines.status === "fulfilled" ? pipelines.value : null,
      routing:
        routing.status === "fulfilled"
          ? routing.value.value.routingEntries
          : null,
    });
  }, []);
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const stored = useMemo(() => registry?.profiles ?? [], [registry]);
  const dirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(stored);
  const issues = useMemo(
    () =>
      registry && draft
        ? validateRegistry({ ...registry, profiles: draft }).filter((i) =>
            i.field.startsWith("profiles."),
          )
        : [],
    [registry, draft],
  );
  const shownIssues = useMemo(
    () =>
      issues.filter((i) => {
        const owner = /^profiles\.([^.]+)\./.exec(i.field)?.[1];
        return owner === undefined || touched.has(owner);
      }),
    [issues, touched],
  );

  const routeStateOf = useCallback(
    (pipelineCustomId: string): RouteState | null => {
      if (!status.pipelines) return null;
      const objectId = status.pipelines.get(pipelineCustomId);
      if (!objectId) return "absent";
      if (!status.routing) return null;
      return describeRouteState(
        status.routing.map((e) => ({
          ...e,
          description: "",
          pipelineType: "custom",
        })),
        objectId,
      ).state;
    },
    [status],
  );

  const rows: Row[] = useMemo(() => {
    if (!registry || !draft) return [];
    const storedIds = new Set(stored.map((p) => p.id));
    return [
      {
        id: DEFAULT_PROFILE_ID,
        name: "Default",
        isDefault: true,
        routeMatcher: registry.routeMatcher,
        pipelineCustomId: registry.pipelineCustomId,
        active: profileId === DEFAULT_PROFILE_ID,
        unsaved: false,
      },
      ...draft.map((p) => ({
        id: p.id,
        name: p.name,
        isDefault: false,
        routeMatcher: p.routeMatcher,
        pipelineCustomId: p.pipelineCustomId,
        active: profileId === p.id,
        unsaved: !storedIds.has(p.id),
      })),
    ];
  }, [registry, draft, stored, profileId]);

  const update = (id: string, patch: Partial<Profile>) => {
    setTouched((t) => new Set(t).add(id));
    setDraft((d) =>
      d ? d.map((p) => (p.id === id ? { ...p, ...patch } : p)) : d,
    );
  };

  const columns: DataTableColumnDef<Row>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Profile",
        accessor: "name",
        cell: ({ rowData }: { rowData: Row }) => (
          <Flex alignItems="center" gap={8}>
            <Strong>{rowData.name || "(unnamed)"}</Strong>
            {rowData.unsaved && (
              <Chip color="warning" size="condensed">
                Unsaved
              </Chip>
            )}
          </Flex>
        ),
      },
      {
        id: "matcher",
        header: "Takes",
        accessor: (row: Row) => row.routeMatcher.trim() || "(matcher not set)",
        cell: ({ rowData }: { rowData: Row }) => {
          const m = rowData.routeMatcher.trim();
          return m === "true" ? (
            <Text>Every Davis event</Text>
          ) : m === "" ? (
            <Text>(matcher not set)</Text>
          ) : (
            <code>{m}</code>
          );
        },
      },
      {
        id: "rules",
        header: "Rules",
        accessor: (row: Row) => row.id,
        cell: ({ rowData }: { rowData: Row }) => (
          <RuleCountCell profileId={rowData.id} />
        ),
      },
      {
        id: "status",
        header: "Status",
        accessor: (row: Row) => routeStateOf(row.pipelineCustomId) ?? "",
        cell: ({ rowData }: { rowData: Row }) => {
          if (status.pipelines === null) return <Text>...</Text>;
          if (!status.pipelines.has(rowData.pipelineCustomId)) {
            return (
              <Chip color="warning" size="condensed">
                Not deployed
              </Chip>
            );
          }
          const route = routeStateOf(rowData.pipelineCustomId);
          if (route === null) {
            return (
              <Chip color="success" size="condensed">
                Deployed
              </Chip>
            );
          }
          return route === "live" ? (
            <Chip color="success" size="condensed">
              Live
            </Chip>
          ) : route === "shadowed" ? (
            <Chip color="critical" size="condensed">
              Shadowed
            </Chip>
          ) : (
            <Chip color="neutral" size="condensed">
              Deployed, not routed
            </Chip>
          );
        },
      },
      {
        id: "actions",
        header: "",
        accessor: (row: Row) => row.id,
        cell: ({ rowData }: { rowData: Row }) => (
          <Flex gap={8}>
            <Button
              variant="accent"
              disabled={rowData.unsaved}
              onClick={() => {
                setProfileId(rowData.id);
                navigate("/rules");
              }}
            >
              Open
            </Button>
            <Button
              variant="emphasized"
              onClick={() =>
                rowData.isDefault
                  ? navigate("/settings")
                  : setEditing(rowData.id)
              }
            >
              Edit
            </Button>
            {!rowData.isDefault && (
              <Button
                variant="emphasized"
                color="critical"
                onClick={() => setRemoving(rowData.id)}
              >
                Remove
              </Button>
            )}
          </Flex>
        ),
      },
    ],
    [status, routeStateOf, navigate, setProfileId],
  );

  if (isLoading || draft === null || !registry) {
    return (
      <Flex flexDirection="column" padding={32} gap={32}>
        <Heading level={2}>Profiles</Heading>
        {isError ? (
          <Flex alignItems="center" gap={8}>
            <CriticalIcon />
            <Paragraph>{error ?? "Could not load settings."}</Paragraph>
          </Flex>
        ) : (
          <Flex alignItems="center" gap={8}>
            <ProgressCircle />
            <Paragraph>Loading profiles...</Paragraph>
          </Flex>
        )}
      </Flex>
    );
  }

  const createProfile = async (p: Profile) => {
    const next = [...draft, p];
    await saveProfiles(next);
    setDraft(next);
    await refetch();
    setProfileId(p.id);
    void loadStatus();
    refreshFlowStatus();
  };

  const save = () => {
    setSaveState("saving");
    setSaveError(null);
    const removed = removedProfileIds(stored, draft);
    saveProfiles(draft)
      .then(() => refetch())
      .then(async () => {
        const results = await Promise.allSettled(
          removed.map((id) => deleteProfileRules(id)),
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        const cleared = results.filter(
          (r) => r.status === "fulfilled" && r.value === "cleared",
        ).length;
        setCleanupNote(
          removed.length === 0
            ? null
            : failed > 0
              ? `${failed} removed profile(s) could not have their stored rules deleted. They are no longer used.`
              : cleared > 0
                ? "Removed profiles' rules were emptied (deleting needs the new permission: restart the dev server to grant it)."
                : "Removed profiles' stored rules were deleted.",
        );
        setSaveState("saved");
        void loadStatus();
        refreshFlowStatus();
      })
      .catch((e: Error) => {
        setSaveState("error");
        setSaveError(e.message);
      });
  };

  const editingProfile = draft.find((p) => p.id === editing) ?? null;
  const removingProfile = draft.find((p) => p.id === removing) ?? null;
  const pendingRemovals = removedProfileIds(stored, draft).length;

  return (
    <Flex flexDirection="column" padding={32} gap={32}>
      <PageHeader
        title="Profiles"
        subtitle={
          <>
            Each profile is its own pipeline, route and rule set.{" "}
            <HelpTip label="What is a profile?">
              A profile is one independent severity setup: its own rules, its
              own pipeline, and its own route into that pipeline. Its route
              matcher decides which events it takes.
              <br />
              <br />
              <strong>Default</strong> takes every Davis event, so on its own it
              behaves like a tenant-wide setting. Add a profile when one team
              wants its own severities while everyone else keeps the current
              behaviour: give it a narrow matcher such as{" "}
              <code>matchesValue(primary_tags.bu, &quot;bu1&quot;)</code> and
              only those events go through it.
              <br />
              <br />
              Routing is first match wins, so a profile only receives events
              that no enabled route above it already took. Labels are shared by
              every profile; rules, matcher, fallback severity and security
              context are not.
            </HelpTip>
          </>
        }
        action={{ label: "Go to Rules", to: "/rules" }}
      />

      <Flex justifyContent="flex-end">
        <Button variant="accent" onClick={() => setWizardOpen(true)}>
          + New profile
        </Button>
      </Flex>

      <AppTable data={rows} columns={columns} fullWidth />

      {shownIssues.length > 0 && (
        <Surface padding={16}>
          <Flex flexDirection="column" gap={4}>
            <Strong>Cannot save:</Strong>
            {shownIssues.map((issue, i) => (
              <Text key={i}>{issue.message}</Text>
            ))}
          </Flex>
        </Surface>
      )}

      {issues.length > 0 && shownIssues.length === 0 && dirty && (
        <Text>
          Fill in the new profile&apos;s required fields (a route matcher) to
          enable Save.
        </Text>
      )}

      {pendingRemovals > 0 && (
        <Text>
          {pendingRemovals} profile{pendingRemovals === 1 ? "" : "s"} will be
          removed, and the stored rules deleted, when you click Save profiles.
        </Text>
      )}
      {cleanupNote && <Text>{cleanupNote}</Text>}

      <SaveBar
        dirty={dirty}
        saving={saveState === "saving"}
        canSave={issues.length === 0}
        blockedReason="Fill in the required fields above to save."
        error={saveState === "error" ? saveError : null}
        saveLabel="Save profiles"
        onSave={save}
        onDiscard={() => {
          setDraft(null);
          setTouched(new Set());
        }}
      />

      <Modal
        title={`Edit profile "${editingProfile?.name ?? ""}"`}
        show={editingProfile !== null}
        size="large"
        onDismiss={() => setEditing(null)}
        footer={
          <Flex alignItems="center" gap={12}>
            <Text>Not saved yet: use Save profiles afterwards.</Text>
            <Button variant="accent" onClick={() => setEditing(null)}>
              Done
            </Button>
          </Flex>
        }
      >
        {editingProfile && (
          <Flex flexDirection="column" gap={12}>
            <Flex flexDirection="column" gap={2} style={{ maxWidth: 360 }}>
              <Paragraph>Name</Paragraph>
              <TextInput
                value={editingProfile.name}
                onChange={(value) => update(editingProfile.id, { name: value })}
              />
            </Flex>
            <ProfileEditor
              profile={editingProfile}
              onChange={(patch) => update(editingProfile.id, patch)}
            />
            <Text>
              Pipeline: {editingProfile.pipelineCustomId}. Changes are stored
              when you click Save profiles.
            </Text>
          </Flex>
        )}
      </Modal>

      {wizardOpen && (
        <NewProfileWizard
          registry={{ ...registry, profiles: draft }}
          onCreate={createProfile}
          onClose={() => setWizardOpen(false)}
        />
      )}

      <RemoveDialog
        profile={removingProfile}
        deployed={Boolean(
          removingProfile &&
          status.pipelines?.has(removingProfile.pipelineCustomId),
        )}
        checked={status.pipelines !== null}
        onConfirm={() => {
          setDraft(draft.filter((x) => x.id !== removing));
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </Flex>
  );
};
