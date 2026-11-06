import React, { useState } from "react";
import { stateClient } from "@dynatrace-sdk/client-state";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";

import { compile } from "../lib/compiler";
import { effectiveRegistry, rulesKeyFor } from "../lib/config/profiles";
import { normalizeRuleRecord } from "../lib/config/rulesSerialization";
import {
  REGISTRY_STATE_KEY,
  useRegistry,
  useSaveProfiles,
  useSaveRegistry,
} from "../lib/config/useRegistry";
import type { RoleRegistry } from "../lib/types/registry";
import { DEBUG_MARKER } from "./flag";
import {
  fixtureCases,
  ingestBody,
  TEST_PROFILE_ID,
  testProfile,
  testRoles,
  testRules,
} from "./fixtures";

/**
 * DEBUG-ONLY panel (docs/12-test-cycle.md). Seeds the label registry, the `sa-test` profile and the
 * rule matrix in one click, clears them again, and prints the dtctl command that sends the fixture
 * events. Remove with the whole `ui/app/debug` folder plus the `DEBUG-HOOK` line in Settings.
 */
export const DebugPanel = () => {
  const { registry } = useRegistry();
  const saveRegistry = useSaveRegistry();
  const saveProfiles = useSaveProfiles();
  const [message, setMessage] = useState<string | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(`${label}: done. Reloading...`);
      window.setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setMessage(
        `${label} failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      setBusy(false);
    }
  };

  const seed = () =>
    run("Seed", async () => {
      if (!registry) throw new Error("Registry not loaded yet.");
      await saveRegistry({ ...registry, roles: testRoles() });
      const others = (registry.profiles ?? []).filter(
        (p) => p.id !== TEST_PROFILE_ID,
      );
      await saveProfiles([...others, testProfile()]);
      await stateClient.setAppState({
        key: rulesKeyFor(TEST_PROFILE_ID),
        body: { value: JSON.stringify(testRules()) },
      });
    });

  const clear = () =>
    run("Clear", async () => {
      const others = (registry?.profiles ?? []).filter(
        (p) => p.id !== TEST_PROFILE_ID,
      );
      await saveProfiles(others);
      await stateClient
        .deleteAppState({ key: rulesKeyFor(TEST_PROFILE_ID) })
        .catch(() => undefined);
    });

  /** Reads the stored registry and the sa-test rules fresh and shows what the compiler would do with
   * them: which field each role maps to, which roles the rules use, and the resulting matchers. */
  const diagnose = async () => {
    setBusy(true);
    try {
      const reg = await stateClient.getAppState({ key: REGISTRY_STATE_KEY });
      const stored = JSON.parse(reg.value ?? "{}") as RoleRegistry;
      const raw = await stateClient.getAppState({
        key: rulesKeyFor(TEST_PROFILE_ID),
      });
      const rules = (
        JSON.parse(raw.value ?? "[]") as Record<string, unknown>[]
      ).map(normalizeRuleRecord);

      const used = new Set<string>();
      for (const r of rules)
        for (const k of [
          "md1_role",
          "md2_role",
          "md3_role",
          "md4_role",
        ] as const)
          if (r[k]) used.add(r[k]);

      const compiled = compile(
        rules,
        effectiveRegistry(stored, TEST_PROFILE_ID),
      );
      const lines = [
        "ROLES IN THE STORED REGISTRY (id -> field)",
        ...stored.roles.map(
          (r) =>
            `  ${r.role} ("${r.label}") -> ${r.field}${r.enabled ? "" : "  [disabled]"}`,
        ),
        "",
        `ROLE IDS THE ${TEST_PROFILE_ID} RULES USE: ${[...used].join(", ") || "(none)"}`,
        ...[...used]
          .filter((u) => !stored.roles.some((r) => r.role === u))
          .map((u) => `  !! "${u}" is not in the registry`),
        "",
        "COMPILED EXCEPTION MATCHERS",
        ...(compiled.ok
          ? compiled.pipeline.processing.processors
              .filter((p) => p.id.startsWith("sevassist_exception_"))
              .map((p) => `  ${p.id}\n      ${p.matcher}`)
          : compiled.errors.map((e) => `  compile error: ${e.message}`)),
      ];
      setDiagnosis(lines.join("\n"));
    } catch (e) {
      setDiagnosis(
        `Diagnosis failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const buildCommand = () => {
    const runId = `run-${new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, "")
      .slice(0, 14)}`;
    const payload = JSON.stringify({
      events: fixtureCases.map((c) => ingestBody(c, runId)),
    });
    setCommand(
      `dtctl exec function -f ui/app/debug/ingest.js --payload '${payload}'\n\n# then assert (run id ${runId}):\n# see docs/12-test-cycle.md`,
    );
  };

  return (
    <Surface padding={20} data-debug-marker={DEBUG_MARKER}>
      <Flex flexDirection="column" gap={12}>
        <Heading level={3}>Debug: test fixtures</Heading>
        <Paragraph>
          Development only. Seeding replaces the label mapping and adds the{" "}
          {TEST_PROFILE_ID} profile with its rules. Clearing removes the profile
          and its rules; uninstall its pipeline and route on the Pipeline screen
          first.
        </Paragraph>
        <Flex gap={8} flexWrap="wrap">
          <Button
            variant="accent"
            disabled={busy || !registry}
            onClick={() => void seed()}
          >
            Seed test fixtures
          </Button>
          <Button
            variant="emphasized"
            disabled={busy || !registry}
            onClick={() => void clear()}
          >
            Clear test fixtures
          </Button>
          <Button variant="emphasized" onClick={buildCommand}>
            Build ingest command
          </Button>
          <Button
            variant="emphasized"
            disabled={busy}
            onClick={() => void diagnose()}
          >
            Show what the compiler sees
          </Button>
        </Flex>
        {message && <Paragraph>{message}</Paragraph>}
        {diagnosis && (
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {diagnosis}
          </pre>
        )}
        {command && (
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {command}
          </pre>
        )}
      </Flex>
    </Surface>
  );
};
