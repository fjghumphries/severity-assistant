import React, { useState } from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import {
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Chip, ProgressCircle } from "@dynatrace/strato-components/content";
import { Modal } from "@dynatrace/strato-components/overlays";
import { type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { CriticalIcon } from "@dynatrace/strato-icons";

import {
  fetchPatternSuggestions,
  type PatternSuggestion,
} from "../../lib/queries/patternSuggestions";
import {
  DISCOVERY_WINDOWS,
  type DiscoveryWindow,
} from "../../lib/types/discovery";
import { Select } from "@dynatrace/strato-components/forms";
import { AppTable } from "../../components/AppTable";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; suggestions: PatternSuggestion[] };

interface Props {
  /** Scopes the suggestions to the rule's own event, when it has one. */
  eventName: string | null;
  onPick: (pattern: string) => void;
}

/**
 * Offers threshold patterns derived from the event descriptions the tenant actually produced, so
 * the user is not limited to the hand-written presets. A cluster with no number in it cannot drive
 * a threshold and is filtered out before it reaches here.
 */
export const PatternSuggestions = ({ eventName, onPick }: Props) => {
  const [open, setOpen] = useState(false);
  const [window, setWindow] = useState<DiscoveryWindow>("24h");
  const [state, setState] = useState<State>({ status: "idle" });

  const run = (w: DiscoveryWindow) => {
    setState({ status: "loading" });
    fetchPatternSuggestions(w, eventName)
      .then((suggestions) => setState({ status: "ready", suggestions }))
      .catch((e: Error) => setState({ status: "error", message: e.message }));
  };

  const columns: DataTableColumnDef<PatternSuggestion>[] = [
    {
      id: "sample",
      header: "Example description",
      accessor: "sample",
      minWidth: 300,
    },
    {
      id: "matches",
      header: "Events",
      accessor: "matches",
      columnType: "meterbar",
      config: { max: "data-max" },
    },
    {
      id: "pattern",
      header: "Pattern",
      accessor: "pattern",
      minWidth: 260,
      cell: ({ rowData }: { rowData: PatternSuggestion }) => (
        <Flex flexDirection="column" gap={2}>
          <Text style={{ fontFamily: "monospace" }}>{rowData.pattern}</Text>
          {rowData.approximated && (
            <Chip color="warning" size="condensed">
              Number type guessed
            </Chip>
          )}
        </Flex>
      ),
    },
    {
      id: "use",
      header: "",
      accessor: (row: PatternSuggestion) => row.pattern,
      cell: ({ rowData }: { rowData: PatternSuggestion }) => (
        <Button
          variant="accent"
          onClick={() => {
            onPick(rowData.pattern);
            setOpen(false);
          }}
        >
          Use
        </Button>
      ),
    },
  ];

  return (
    <>
      <Flex>
        <Button
          variant="emphasized"
          onClick={() => {
            setOpen(true);
            run(window);
          }}
        >
          Suggest from recent events
        </Button>
      </Flex>

      <Modal
        title="Patterns from recent event descriptions"
        show={open}
        size="large"
        onDismiss={() => setOpen(false)}
        footer={
          <Button variant="emphasized" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        }
      >
        <Flex flexDirection="column" gap={12}>
          <Text>
            Groups the event descriptions from the window below and turns each
            one into a pattern that reads its number.{" "}
            {eventName?.trim()
              ? `Scoped to "${eventName.trim()}".`
              : "Across every event."}{" "}
            Descriptions with no number in them cannot drive a threshold and are
            left out.
          </Text>

          <Flex gap={8} alignItems="center">
            <Select
              value={window}
              onChange={(v) => {
                if (!v) return;
                setWindow(v);
                run(v);
              }}
            >
              <Select.Content>
                {DISCOVERY_WINDOWS.map((w) => (
                  <Select.Option key={w.value} value={w.value}>
                    {w.label}
                  </Select.Option>
                ))}
              </Select.Content>
            </Select>
            <Button
              variant="emphasized"
              disabled={state.status === "loading"}
              onClick={() => run(window)}
            >
              Refresh
            </Button>
          </Flex>

          {state.status === "loading" && (
            <Flex alignItems="center" gap={8}>
              <ProgressCircle />
              <Paragraph>Grouping descriptions...</Paragraph>
            </Flex>
          )}

          {state.status === "error" && (
            <Flex alignItems="center" gap={8}>
              <CriticalIcon />
              <Paragraph>
                {state.message}
                {/\b(scope|permission|forbidden)\b/i.test(state.message) &&
                  " -- this needs the davis:analyzers:execute permission, so restart the dev server to grant it."}
              </Paragraph>
            </Flex>
          )}

          {state.status === "ready" &&
            (state.suggestions.length === 0 ? (
              <Paragraph>
                <Strong>No usable pattern found.</Strong> The descriptions in
                this window carry no number, so there is nothing for a threshold
                to read. Widen the window, or write the pattern by hand.
              </Paragraph>
            ) : (
              <AppTable
                data={state.suggestions}
                columns={columns}
                sortable
                fullWidth
              />
            ))}
        </Flex>
      </Modal>
    </>
  );
};
