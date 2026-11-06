import React, { useMemo, useState } from "react";

import { Flex } from "@dynatrace/strato-components/layouts";
import {
  Paragraph,
  Strong,
  Text,
  TextEllipsis,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Chip } from "@dynatrace/strato-components/content";
import { TextInput } from "@dynatrace/strato-components/forms";
import { Modal } from "@dynatrace/strato-components/overlays";
import { type DataTableColumnDef } from "@dynatrace/strato-components/tables";

import type { EventCatalogueEntry } from "../../lib/queries/derive";
import { AppTable } from "../../components/AppTable";

interface Row extends EventCatalogueEntry {
  /** A rule in this profile already targets this event name. */
  inUse: boolean;
}

const severityLabel = (severities: string[]): string =>
  severities.length === 0
    ? "-"
    : severities.map((s) => (s === "" ? "none" : s)).join(", ");

interface Props {
  show: boolean;
  /** Event names already targeted by a rule, so a duplicate target is visible before saving. */
  usedEventNames: Set<string>;
  eventCatalogue: EventCatalogueEntry[];
  onPick: (eventName: string) => void;
  onDismiss: () => void;
}

/**
 * Browse the event names seen in the discovery window as a table. A chip list stops working once
 * there are many events or their names share a long prefix, so this shows the full name, how often
 * it occurred, the severity it carries today and whether a rule already targets it -- enough to
 * tell near-identical names apart without leaving the editor.
 */
export const EventPickerModal = ({
  show,
  usedEventNames,
  eventCatalogue,
  onPick,
  onDismiss,
}: Props) => {
  const [search, setSearch] = useState("");
  const [hideUsed, setHideUsed] = useState(false);

  const rows: Row[] = useMemo(() => {
    const query = search.trim().toLowerCase();
    return eventCatalogue
      .map((e) => ({ ...e, inUse: usedEventNames.has(e.eventName) }))
      .filter((e) =>
        query === "" ? true : e.eventName.toLowerCase().includes(query),
      )
      .filter((e) => !(hideUsed && e.inUse));
  }, [eventCatalogue, usedEventNames, search, hideUsed]);

  const columns: DataTableColumnDef<Row>[] = useMemo(
    () => [
      {
        id: "eventName",
        header: "Event name",
        accessor: "eventName",
        minWidth: 320,
        cell: ({ rowData }: { rowData: Row }) => (
          <TextEllipsis truncationMode="end" title={rowData.eventName}>
            {rowData.eventName}
          </TextEllipsis>
        ),
      },
      {
        id: "count",
        header: "Occurrences",
        accessor: "count",
        columnType: "meterbar",
        config: { max: "data-max" },
      },
      {
        id: "severities",
        header: "Severity today",
        accessor: (row: Row) => severityLabel(row.severities),
      },
      {
        id: "inUse",
        header: "Rule exists",
        accessor: (row: Row) => (row.inUse ? "yes" : "no"),
        cell: ({ rowData }: { rowData: Row }) =>
          rowData.inUse ? (
            <Chip color="warning" size="condensed">
              Already targeted
            </Chip>
          ) : (
            <Text>-</Text>
          ),
      },
      {
        id: "pick",
        header: "",
        accessor: (row: Row) => row.eventName,
        cell: ({ rowData }: { rowData: Row }) => (
          <Button variant="accent" onClick={() => onPick(rowData.eventName)}>
            Use
          </Button>
        ),
      },
    ],
    [onPick],
  );

  return (
    <Modal
      title="Choose an event"
      show={show}
      size="large"
      onDismiss={onDismiss}
      footer={
        <Button variant="emphasized" onClick={onDismiss}>
          Cancel
        </Button>
      }
    >
      <Flex flexDirection="column" gap={12}>
        <Text>
          Event names seen in the last 2 hours. &quot;Already targeted&quot;
          means another rule in this profile already uses that name: two
          defaults cannot target the same event.
        </Text>
        <Flex gap={12} alignItems="center" flexWrap="wrap">
          <TextInput
            value={search}
            placeholder="Search event names"
            onChange={setSearch}
          />
          <Button variant="emphasized" onClick={() => setHideUsed(!hideUsed)}>
            {hideUsed ? "Show all" : "Hide already targeted"}
          </Button>
          <Text>
            {rows.length} of {eventCatalogue.length}
          </Text>
        </Flex>
        {rows.length === 0 ? (
          <Paragraph>
            {eventCatalogue.length === 0
              ? "No events seen in the last 2 hours. Close this and type the exact event name."
              : "Nothing matches that search."}
          </Paragraph>
        ) : (
          <Flex style={{ maxHeight: 420, overflowY: "auto" }}>
            <AppTable data={rows} columns={columns} sortable fullWidth />
          </Flex>
        )}
      </Flex>
    </Modal>
  );
};

/** The event-name field: free text plus the table picker, and a warning when the typed name is
 * not one the tenant has actually produced (a silent never-matches otherwise). */
export const EventNameField = ({
  eventName,
  setEventName,
  placeholder,
  usedEventNames,
  eventCatalogue,
}: {
  eventName: string;
  setEventName: (v: string) => void;
  placeholder: string;
  usedEventNames: Set<string>;
  eventCatalogue: EventCatalogueEntry[];
}) => {
  const [browsing, setBrowsing] = useState(false);
  const typed = eventName.trim();
  const known = useMemo(
    () => eventCatalogue.some((e) => e.eventName === typed),
    [eventCatalogue, typed],
  );

  return (
    <Flex flexDirection="column" gap={4}>
      <Paragraph>Event name</Paragraph>
      <Flex gap={8} alignItems="center" flexWrap="wrap">
        <Flex style={{ flex: 1, minWidth: 260 }}>
          <TextInput
            value={eventName}
            onChange={setEventName}
            placeholder={placeholder}
          />
        </Flex>
        <Button variant="accent" onClick={() => setBrowsing(true)}>
          Browse events ({eventCatalogue.length})
        </Button>
      </Flex>
      {typed !== "" && !known && eventCatalogue.length > 0 && (
        <Text>
          <Strong>No event with this exact name</Strong> occurred in the last 2
          hours. It still saves, but check the spelling: a name that never
          occurs silently matches nothing.
        </Text>
      )}
      <EventPickerModal
        show={browsing}
        usedEventNames={usedEventNames}
        eventCatalogue={eventCatalogue}
        onPick={(name) => {
          setEventName(name);
          setBrowsing(false);
        }}
        onDismiss={() => setBrowsing(false)}
      />
    </Flex>
  );
};
