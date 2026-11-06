import React, { useEffect } from "react";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Chip } from "@dynatrace/strato-components/content";
import { CriticalIcon } from "@dynatrace/strato-icons";

interface Props {
  /** True while the draft differs from what is stored. */
  dirty: boolean;
  saving: boolean;
  /** False when validation blocks saving; `blockedReason` then says why. */
  canSave: boolean;
  blockedReason?: string;
  error?: string | null;
  saveLabel?: string;
  onSave: () => void;
  onDiscard?: () => void;
}

/**
 * The "you have unsaved changes" bar. Edits on Settings and Profiles are drafts until saved, and a
 * Save button at the bottom of a long page is easy to miss -- so this sticks to the bottom of the
 * window while anything is unsaved, says so in words, and also guards against closing the tab.
 */
export const SaveBar = ({
  dirty,
  saving,
  canSave,
  blockedReason,
  error,
  saveLabel = "Save changes",
  onSave,
  onDiscard,
}: Props) => {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!dirty && !error) return null;

  return (
    <div style={{ position: "sticky", bottom: 16, zIndex: 5 }}>
      <Surface padding={16} elevation="floating">
        <Flex
          alignItems="center"
          justifyContent="space-between"
          gap={16}
          flexWrap="wrap"
        >
          <Flex alignItems="center" gap={12} flexWrap="wrap">
            {error ? (
              <>
                <CriticalIcon />
                <Text>{error}</Text>
              </>
            ) : (
              <>
                <Chip color="warning" size="condensed">
                  Unsaved changes
                </Chip>
                <Text>
                  {canSave
                    ? "Nothing here takes effect until you save."
                    : (blockedReason ?? "Fix the problems above to save.")}
                </Text>
              </>
            )}
          </Flex>
          <Flex alignItems="center" gap={8}>
            {onDiscard && (
              <Button
                variant="emphasized"
                disabled={saving}
                onClick={onDiscard}
              >
                Discard
              </Button>
            )}
            <Button
              variant="accent"
              disabled={!canSave || saving}
              onClick={onSave}
            >
              {saving ? "Saving..." : saveLabel}
            </Button>
          </Flex>
        </Flex>
      </Surface>
    </div>
  );
};
