import React, { useRef, useState } from "react";
import { stateClient } from "@dynatrace-sdk/client-state";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Strong,
} from "@dynatrace/strato-components/typography";
import { Select } from "@dynatrace/strato-components/forms";
import { Button } from "@dynatrace/strato-components/buttons";

import {
  type ImportMode,
  makeRulesExport,
  type ParsedImport,
  parseRulesExport,
  planImport,
  rulesExportFileName,
} from "../../lib/backup/rulesExport";
import { readAllRules } from "../../lib/config/readAllRules";
import { rulesKeyFor } from "../../lib/config/profiles";
import { notifyStateChanged } from "../../lib/config/stateEvents";
import { REGISTRY_STATE_KEY, useRegistry } from "../../lib/config/useRegistry";
import type { RoleRegistry } from "../../lib/types/registry";
import type { Rule } from "../../lib/types/rule";

/** Reads the stored registry fresh, so a merge never works from a stale copy. */
async function readRegistryNow(fallback: RoleRegistry): Promise<RoleRegistry> {
  try {
    const res = await stateClient.getAppState({ key: REGISTRY_STATE_KEY });
    return JSON.parse(res.value) as RoleRegistry;
  } catch {
    return fallback;
  }
}

function download(text: string, name: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export and import of the app's own settings: labels, teams and rules. The file is the source,
 * not compiled output, so it can be restored or carried to another tenant. Importing only writes
 * App State; it never deploys, so nothing reaches an event until the user publishes.
 */
export const RulesTransfer = () => {
  const { registry } = useRegistry();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const doExport = async () => {
    if (!registry) return;
    setBusy(true);
    setMessage(null);
    try {
      const all = await readAllRules(registry);
      const byProfile: Record<string, Rule[]> = {};
      for (const p of all) byProfile[p.profileId] = p.rules;
      const file = makeRulesExport(registry, byProfile);
      download(
        JSON.stringify(file, null, 2),
        rulesExportFileName(file.createdAt),
      );
      const n = all.reduce((s, p) => s + p.rules.length, 0);
      setMessage({
        ok: true,
        text: `Exported ${n} rules from ${all.length} teams.`,
      });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      setParsed(parseRulesExport(await file.text()));
      setFileName(file.name);
    } catch (e) {
      setParsed(null);
      setMessage({ ok: false, text: (e as Error).message });
    }
  };

  const apply = async () => {
    if (!parsed || parsed.issues.length > 0 || !registry) return;
    setBusy(true);
    setMessage(null);
    try {
      const currentRegistry = await readRegistryNow(registry);
      const all = await readAllRules(currentRegistry);
      const current: Record<string, Rule[]> = {};
      for (const p of all) current[p.profileId] = p.rules;
      const plan = planImport(
        { registry: currentRegistry, rules: current },
        parsed.data,
        mode,
      );
      await stateClient.setAppState({
        key: REGISTRY_STATE_KEY,
        body: { value: JSON.stringify(plan.registry) },
      });
      notifyStateChanged(REGISTRY_STATE_KEY);
      for (const [id, list] of Object.entries(plan.rules)) {
        const key = rulesKeyFor(id);
        await stateClient.setAppState({
          key,
          body: { value: JSON.stringify(list) },
        });
        notifyStateChanged(key);
      }
      const s = plan.summary;
      setMessage({
        ok: true,
        text: `Imported: ${s.rulesAdded} rules added${s.rulesSkipped > 0 ? `, ${s.rulesSkipped} already present and kept` : ""}, ${s.labelsAdded} labels, ${s.profilesAdded} teams. Nothing is published yet: review and publish from the Pipeline screen.`,
      });
      setParsed(null);
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const ruleCount = parsed
    ? Object.values(parsed.data.rules).reduce((n, l) => n + l.length, 0)
    : 0;

  return (
    <Flex flexDirection="column" gap={12}>
      <Heading level={3}>Export and import rules</Heading>
      <Paragraph style={{ maxWidth: 760 }}>
        Save your labels, teams and rules as one file on your computer, to keep
        a copy, move them to another tenant or track changes in version control.
        Importing never publishes anything by itself.
      </Paragraph>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Flex gap={8}>
        <Button
          variant="emphasized"
          disabled={busy || !registry}
          onClick={() => void doExport()}
        >
          Export rules...
        </Button>
        <Button
          variant="emphasized"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Import rules from a file...
        </Button>
      </Flex>

      {parsed && (
        <Surface padding={16}>
          <Flex flexDirection="column" gap={8}>
            <Paragraph>
              <Strong>{fileName}</Strong>: {ruleCount} rules,{" "}
              {parsed.data.registry.roles.length} labels,{" "}
              {(parsed.data.registry.profiles ?? []).length + 1} teams
              {parsed.data.createdAt
                ? `, exported ${parsed.data.createdAt}`
                : ""}
              .
            </Paragraph>
            {parsed.issues.length > 0 ? (
              <Flex flexDirection="column" gap={2}>
                <Paragraph>
                  <Strong>This file cannot be imported:</Strong>
                </Paragraph>
                {parsed.issues.slice(0, 10).map((m, i) => (
                  <Paragraph key={i}>&bull; {m}</Paragraph>
                ))}
                {parsed.issues.length > 10 && (
                  <Paragraph>
                    ...and {parsed.issues.length - 10} more.
                  </Paragraph>
                )}
              </Flex>
            ) : (
              <Flex gap={12} alignItems="flex-end" flexFlow="wrap">
                <Flex flexDirection="column" gap={2} style={{ minWidth: 320 }}>
                  <Paragraph>How to import</Paragraph>
                  <Select value={mode} onChange={(v) => v && setMode(v)}>
                    <Select.Content>
                      <Select.Option value="merge">
                        Merge: keep what I have, add what is missing
                      </Select.Option>
                      <Select.Option value="replace">
                        Replace: use the file as is
                      </Select.Option>
                    </Select.Content>
                  </Select>
                </Flex>
                <Button
                  variant="accent"
                  disabled={busy}
                  onClick={() => void apply()}
                >
                  {mode === "replace"
                    ? "Replace with this file"
                    : "Merge this file"}
                </Button>
                <Button variant="emphasized" onClick={() => setParsed(null)}>
                  Cancel
                </Button>
              </Flex>
            )}
          </Flex>
        </Surface>
      )}
      {message && <Paragraph>{message.text}</Paragraph>}
    </Flex>
  );
};
