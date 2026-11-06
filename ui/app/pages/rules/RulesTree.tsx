import React, { useMemo, useState } from "react";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import {
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Chip } from "@dynatrace/strato-components/content";
import { Switch, TextInput } from "@dynatrace/strato-components/forms";
import { Modal } from "@dynatrace/strato-components/overlays";
import { type DataTableColumnDef } from "@dynatrace/strato-components/tables";

import { Intro } from "../../components/HelpTip";
import { Prose } from "../../components/Prose";
import { RuleSeverity } from "../../components/SeverityBadge";
import {
  findDuplicateDefaultTargets,
  findDuplicateRules,
  findExceptionOrderConflicts,
} from "../../lib/config/validateRule";
import type { EventCatalogueEntry } from "../../lib/queries/derive";
import type { AnomalyDetectorOption } from "../../lib/queries/useAnomalyDetectors";
import { removeRule, swapOrder } from "../../lib/rules/candidate";
import {
  filterTree,
  groupRules,
  summarizeTree,
  type RuleTree,
  type TargetGroup,
} from "../../lib/rules/group";
import type { RoleRegistry } from "../../lib/types/registry";
import { getConditions, isException, type Rule } from "../../lib/types/rule";
import { RuleEditorModal, type EditorRequest } from "./RuleEditorModal";
import { ErrorLine, useSaveHandler } from "./shared";
import { AppTable } from "../../components/AppTable";

interface Props {
  rules: Rule[];
  registry: RoleRegistry;
  detectorName: (id: string) => string;
  eventCatalogue: EventCatalogueEntry[];
  detectors: AnomalyDetectorOption[];
  persist: (next: Rule[]) => Promise<void>;
}

/** A row in the table: one target (an event or a detector) with its default and its exceptions. */
interface Row {
  key: string;
  group: TargetGroup;
  name: string;
}

/** "Business Unit = bu1, Tier not set" -- an exception's label conditions, in the user's own words. */
function conditionsText(rule: Rule, registry: RoleRegistry): string {
  return getConditions(rule)
    .filter((c) => c.role !== null)
    .map((c) => {
      const label =
        registry.roles.find((r) => r.role === c.role)?.label ?? c.role;
      return c.value ? `${label} = ${c.value}` : `${label} not set`;
    })
    .join(", ");
}

interface ExceptionListProps {
  /** The exceptions to show, in the order they apply; the arrows move within this list. */
  rules: Rule[];
  registry: RoleRegistry;
  onEdit: (rule: Rule) => void;
  onDelete: (rule: Rule) => void;
  onToggle: (rule: Rule) => void;
  onMove: (rule: Rule, neighbour: Rule) => void;
  busy: boolean;
}

/** The exceptions under one target, in precedence order: the last one that matches wins. */
const ExceptionList = ({
  rules,
  registry,
  onEdit,
  onDelete,
  onToggle,
  onMove,
  busy,
}: ExceptionListProps) => {
  if (rules.length === 0)
    return <Text>No exceptions: this default applies everywhere.</Text>;
  return (
    <Flex flexDirection="column" gap={12}>
      {rules.map((r, i) => (
        <Flex key={r.rule_id} alignItems="center" gap={16} flexWrap="wrap">
          <Flex gap={4} alignItems="center" style={{ minWidth: 112 }}>
            <Text style={{ minWidth: 28 }}>#{i + 1}</Text>
            <Button
              variant="emphasized"
              disabled={busy || i === 0}
              aria-label="Apply earlier"
              onClick={() => onMove(r, rules[i - 1])}
            >
              ▲
            </Button>
            <Button
              variant="emphasized"
              disabled={busy || i === rules.length - 1}
              aria-label="Apply later"
              onClick={() => onMove(r, rules[i + 1])}
            >
              ▼
            </Button>
          </Flex>
          <Text style={{ flex: 1, minWidth: 220 }}>
            {conditionsText(r, registry)}
          </Text>
          <RuleSeverity
            ruleType={r.rule_type}
            severity={r.severity}
            thresholdBounds={r.threshold_bounds}
          />
          <Switch
            value={r.enabled}
            disabled={busy}
            onChange={() => onToggle(r)}
          />
          <Flex gap={8}>
            <Button
              variant="emphasized"
              disabled={busy}
              onClick={() => onEdit(r)}
            >
              Edit
            </Button>
            <Button
              variant="emphasized"
              color="critical"
              disabled={busy}
              onClick={() => onDelete(r)}
            >
              Delete
            </Button>
          </Flex>
        </Flex>
      ))}
      {rules.length > 1 && (
        <Text>Applied top to bottom; the last one that matches wins.</Text>
      )}
    </Flex>
  );
};

/**
 * Every rule of a profile in one place, arranged by what it is about: one row per event or
 * anomaly detector with its system-wide default and how many label-based exceptions refine it,
 * expanding to those exceptions. Built for a large rule set -- an event's whole story is on one
 * row instead of split across a defaults list and an exceptions list.
 *
 * Everything is edited here: add, edit, delete, switch on or off, and reorder.
 */
export const RulesTree = ({
  rules,
  registry,
  detectorName,
  eventCatalogue,
  detectors,
  persist,
}: Props) => {
  const [query, setQuery] = useState("");
  const [issuesOnly, setIssuesOnly] = useState(false);
  // Which rows are open, keyed by the target's stable key rather than by row position, so a save
  // (which re-derives every row) or a deleted/re-sorted row cannot close or shift an open one.
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [deleting, setDeleting] = useState<{
    rule: Rule;
    label: string;
  } | null>(null);
  const { saveState, saveError, run } = useSaveHandler(persist);
  const busy = saveState === "saving";

  const nameOf = useMemo(
    () => (g: Pick<TargetGroup, "kind" | "target">) =>
      g.kind === "detector" ? detectorName(g.target) : g.target,
    [detectorName],
  );

  const tree: RuleTree = useMemo(
    () => groupRules(rules, nameOf),
    [rules, nameOf],
  );
  const summary = useMemo(() => summarizeTree(tree), [tree]);

  // Problems a list can have that a single rule's own validation cannot see.
  const conflicts = useMemo(
    () => [
      ...findDuplicateDefaultTargets(rules),
      ...findDuplicateRules(rules.filter(isException)),
      ...findExceptionOrderConflicts(rules),
    ],
    [rules],
  );

  const shown: RuleTree = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = filterTree(
      tree,
      query,
      (g) => nameOf(g).toLowerCase().includes(q),
      (r) =>
        r.name.toLowerCase().includes(q) ||
        conditionsText(r, registry).toLowerCase().includes(q),
    );
    return issuesOnly
      ? { groups: base.groups.filter((g) => g.default === null), anyEvent: [] }
      : base;
  }, [tree, query, issuesOnly, nameOf, registry]);

  const rows: Row[] = useMemo(
    () =>
      shown.groups.map((group) => ({
        key: group.key,
        group,
        name: nameOf(group),
      })),
    [shown, nameOf],
  );

  const targetOf = (g: TargetGroup) =>
    g.kind === "detector" ? { detectorId: g.target } : { eventName: g.target };

  const toggle = (rule: Rule) =>
    void run(
      rules.map((r) =>
        r.rule_id === rule.rule_id ? { ...r, enabled: !r.enabled } : r,
      ),
    );
  const move = (rule: Rule, neighbour: Rule) =>
    void run(swapOrder(rules, rule.rule_id, neighbour.rule_id));
  const confirmDelete = async () => {
    if (!deleting) return;
    if (await run(removeRule(rules, deleting.rule.rule_id))) setDeleting(null);
  };

  const exceptionHandlers = {
    registry,
    busy,
    onEdit: (rule: Rule) => setEditor({ kind: "exception", editing: rule }),
    onDelete: (rule: Rule) =>
      setDeleting({ rule, label: conditionsText(rule, registry) }),
    onToggle: toggle,
    onMove: move,
  };

  const columns: DataTableColumnDef<Row>[] = [
    {
      id: "enabled",
      header: "On",
      accessor: (row: Row) => row.group.default?.enabled ?? false,
      cell: ({ rowData }: { rowData: Row }) =>
        rowData.group.default ? (
          <Switch
            value={rowData.group.default.enabled}
            disabled={busy}
            onChange={() =>
              rowData.group.default && toggle(rowData.group.default)
            }
          />
        ) : (
          <></>
        ),
    },
    {
      id: "name",
      header: "Event or anomaly detector",
      accessor: "name",
      minWidth: 300,
      cell: ({ rowData }: { rowData: Row }) => (
        <Flex alignItems="center" gap={8} flexWrap="wrap">
          <Text>{rowData.name}</Text>
          {rowData.group.kind === "detector" && (
            <Chip color="neutral" size="condensed">
              Detector
            </Chip>
          )}
        </Flex>
      ),
    },
    {
      id: "default",
      header: "System-wide default",
      accessor: (row: Row) => row.group.default?.severity ?? "",
      cell: ({ rowData }: { rowData: Row }) =>
        rowData.group.default ? (
          <RuleSeverity
            ruleType={rowData.group.default.rule_type}
            severity={rowData.group.default.severity}
            thresholdBounds={rowData.group.default.threshold_bounds}
          />
        ) : (
          <Chip color="warning" size="condensed">
            No default
          </Chip>
        ),
    },
    {
      id: "exceptions",
      header: "Exceptions",
      accessor: (row: Row) => row.group.exceptions.length,
    },
    {
      id: "actions",
      header: "",
      accessor: (row: Row) => row.key,
      cell: ({ rowData }: { rowData: Row }) => {
        const def = rowData.group.default;
        return (
          <Flex gap={8} flexWrap="wrap">
            {def ? (
              <Button
                variant="emphasized"
                disabled={busy}
                onClick={() => setEditor({ kind: "default", editing: def })}
              >
                Edit
              </Button>
            ) : (
              <Button
                variant="emphasized"
                disabled={busy}
                onClick={() =>
                  setEditor({
                    kind: "default",
                    editing: null,
                    target: targetOf(rowData.group),
                  })
                }
              >
                Add default
              </Button>
            )}
            <Button
              variant="emphasized"
              disabled={busy}
              onClick={() =>
                setEditor({
                  kind: "exception",
                  editing: null,
                  target: targetOf(rowData.group),
                })
              }
            >
              + Exception
            </Button>
            {def && (
              <Button
                variant="emphasized"
                color="critical"
                disabled={busy}
                onClick={() => setDeleting({ rule: def, label: rowData.name })}
              >
                Delete
              </Button>
            )}
          </Flex>
        );
      },
    },
  ];

  return (
    <Flex flexDirection="column" gap={24} padding={16}>
      <Flex
        justifyContent="space-between"
        alignItems="center"
        gap={16}
        flexWrap="wrap"
      >
        <Intro
          tip={
            <>
              Each row is one event or anomaly detector. Its{" "}
              <strong>system-wide default</strong> applies to every event of
              that kind, wherever it comes from;{" "}
              <strong>label-based exceptions</strong> underneath override it for
              the events whose labels match, so one team or environment can
              differ without affecting anyone else.
              <br />
              <br />
              Each event or detector can have <strong>one</strong> default.
              Exceptions apply top to bottom and the last one that matches wins.
              An exception can also leave the event blank and match on labels
              alone.
            </>
          }
        >
          One row per event or detector, with its exceptions underneath.
        </Intro>
        <Flex gap={8}>
          <Button
            variant="accent"
            disabled={busy}
            onClick={() => setEditor({ kind: "default", editing: null })}
          >
            + Add default severity
          </Button>
          <Button
            variant="emphasized"
            disabled={busy}
            onClick={() => setEditor({ kind: "exception", editing: null })}
          >
            + Add exception
          </Button>
        </Flex>
      </Flex>

      <Flex gap={12} alignItems="center" flexWrap="wrap">
        <Flex style={{ flex: 1, minWidth: 260 }}>
          <TextInput
            value={query}
            onChange={setQuery}
            placeholder="Search events, detectors, rule names or label values..."
          />
        </Flex>
        <Text>
          {summary.targets} target{summary.targets === 1 ? "" : "s"},{" "}
          {summary.exceptions} exception
          {summary.exceptions === 1 ? "" : "s"}
        </Text>
        {summary.orphans > 0 && (
          <Button
            variant="emphasized"
            onClick={() => setIssuesOnly(!issuesOnly)}
          >
            {issuesOnly
              ? "Show everything"
              : `${summary.orphans} without a default`}
          </Button>
        )}
      </Flex>

      {conflicts.length > 0 && (
        <Surface padding={16}>
          <Flex flexDirection="column" gap={4}>
            <Strong>Conflicting rules:</Strong>
            {conflicts.map((issue, i) => (
              <Paragraph key={i}>{issue.message}</Paragraph>
            ))}
          </Flex>
        </Surface>
      )}

      {saveState === "error" && saveError && <ErrorLine message={saveError} />}

      {summary.orphans > 0 && !issuesOnly && (
        <Prose>
          <Strong>{summary.orphans}</Strong> event
          {summary.orphans === 1 ? "" : "s"} or detector
          {summary.orphans === 1 ? "" : "s"} carry exceptions but no system-wide
          default of their own, so those exceptions only apply to the labels
          they name and everything else falls back to the profile&apos;s
          fallback. Use &quot;Add default&quot; on the row to give one.
        </Prose>
      )}

      {rows.length === 0 && shown.anyEvent.length === 0 ? (
        <Paragraph>
          {rules.length === 0
            ? "No rules yet. Add a default severity for the event that fires most often."
            : "Nothing matches that search."}
        </Paragraph>
      ) : (
        rows.length > 0 && (
          <AppTable
            data={rows}
            columns={columns}
            rowId={(row: Row) => row.key}
            sortable
            fullWidth
          >
            <AppTable.ExpandableRow<Row>
              expandedRows={expandedRows}
              onExpandedRowsChange={setExpandedRows}
              disableExpand={(row: Row) => row.group.exceptions.length === 0}
            >
              {({ row }: { row: Row }) => (
                <AppTable.ExpandableRowWrapper>
                  <ExceptionList
                    rules={row.group.exceptions}
                    {...exceptionHandlers}
                  />
                </AppTable.ExpandableRowWrapper>
              )}
            </AppTable.ExpandableRow>
          </AppTable>
        )
      )}

      {shown.anyEvent.length > 0 && (
        <Flex flexDirection="column" gap={12}>
          <Strong>
            Exceptions that apply to any event ({shown.anyEvent.length})
          </Strong>
          <Text>
            No event is named, so these match on labels alone, across every
            event carrying them.
          </Text>
          <ExceptionList rules={shown.anyEvent} {...exceptionHandlers} />
        </Flex>
      )}

      {editor && (
        <RuleEditorModal
          request={editor}
          rules={rules}
          registry={registry}
          eventCatalogue={eventCatalogue}
          detectors={detectors}
          detectorName={detectorName}
          persist={persist}
          onClose={() => setEditor(null)}
        />
      )}

      <Modal
        title="Delete this rule?"
        show={deleting !== null}
        size="small"
        onDismiss={() => !busy && setDeleting(null)}
        footer={
          <Flex gap={8}>
            <Button
              variant="accent"
              color="critical"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Deleting..." : "Delete"}
            </Button>
            <Button
              variant="emphasized"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
          </Flex>
        }
      >
        <Flex flexDirection="column" gap={12}>
          <Text>
            <Strong>{deleting?.label}</Strong>
          </Text>
          <Text>
            {deleting && !isException(deleting.rule)
              ? "Deleting a system-wide default leaves any exceptions on this event in place, but they will then have no default beneath them."
              : "The exceptions after it keep their relative order."}
          </Text>
          <Text>This takes effect on events only once you deploy.</Text>
        </Flex>
      </Modal>
    </Flex>
  );
};
