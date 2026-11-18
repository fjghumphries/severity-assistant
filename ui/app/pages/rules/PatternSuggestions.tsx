import React, { useState } from "react";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import {
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Chip, ProgressCircle } from "@dynatrace/strato-components/content";
import { Modal } from "@dynatrace/strato-components/overlays";
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

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; suggestions: PatternSuggestion[] };

interface Props {
  /** Scopes the suggestions to the rule's own event, when it has one. */
  eventName: string | null;
  onPick: (pattern: string, sample: string) => void;
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
            Looks at the event descriptions in the window below and offers a
            pattern for each number it finds.{" "}
            {eventName?.trim()
              ? `Only events named "${eventName.trim()}".`
              : "All events."}{" "}
            Descriptions with no number cannot drive a threshold and are left
            out. Pick the pattern that reads the value you want: a description
            can hold several numbers, such as a threshold and the value that
            crossed it.
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
              <Flex flexDirection="column" gap={8}>
                {state.suggestions.map((sug) => (
                  <Surface key={sug.pattern} padding={16}>
                    <Flex
                      alignItems="center"
                      justifyContent="space-between"
                      gap={16}
                      flexWrap="wrap"
                    >
                      <Flex
                        flexDirection="column"
                        gap={4}
                        style={{ flex: "1 1 360px", minWidth: 0 }}
                      >
                        <Text>
                          <Strong>Reads {sug.reads ?? "a number"}</Strong>
                          {sug.context && <> in &ldquo;{sug.context}&rdquo;</>}
                        </Text>
                        <Text
                          style={{
                            fontFamily: "monospace",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {sug.pattern}
                        </Text>
                        {sug.approximated && (
                          <Flex>
                            <Chip color="warning" size="condensed">
                              Number type guessed
                            </Chip>
                          </Flex>
                        )}
                      </Flex>
                      <Flex alignItems="center" gap={12}>
                        <Text>
                          {sug.matches.toLocaleString()} event
                          {sug.matches === 1 ? "" : "s"}
                        </Text>
                        <Button
                          variant="accent"
                          onClick={() => {
                            onPick(sug.pattern, sug.sample);
                            setOpen(false);
                          }}
                        >
                          Use
                        </Button>
                      </Flex>
                    </Flex>
                  </Surface>
                ))}
              </Flex>
            ))}
        </Flex>
      </Modal>
    </>
  );
};
