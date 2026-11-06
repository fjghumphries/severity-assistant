/**
 * Backup files: a settings object saved to the user's own computer before a write, and read back
 * to restore it. Pure apart from `downloadBackup` (browser download), so the format is testable.
 */

export type BackupKind = "pipeline" | "routing";

export interface BackupFile {
  format: "severity-assistant-backup";
  version: 1;
  kind: BackupKind;
  createdAt: string;
  schemaId: string;
  objectId: string;
  /** The settings object's `value`, exactly as read. */
  value: Record<string, unknown>;
}

export function makeBackup(
  kind: BackupKind,
  schemaId: string,
  live: { objectId: string; value: unknown },
  now: Date = new Date(),
): BackupFile {
  return {
    format: "severity-assistant-backup",
    version: 1,
    kind,
    createdAt: now.toISOString(),
    schemaId,
    objectId: live.objectId,
    value: live.value as Record<string, unknown>,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Parses and validates a backup file's text. Also accepts the bare `{ objectId, value }` routing
 * backups the Routing section used to download. Throws an Error with a user-facing message. */
export function parseBackup(
  text: string,
  schemas: Record<BackupKind, string>,
): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!isRecord(raw)) throw new Error("This file is not a backup.");

  if (
    raw.format === undefined &&
    typeof raw.objectId === "string" &&
    isRecord(raw.value)
  ) {
    if (Array.isArray(raw.value.routingEntries)) {
      return makeBackup(
        "routing",
        schemas.routing,
        { objectId: raw.objectId, value: raw.value },
        new Date(0),
      );
    }
  }
  if (raw.format !== "severity-assistant-backup" || raw.version !== 1) {
    throw new Error("This file is not a Severity Assistant backup.");
  }
  const kind = raw.kind;
  if (kind !== "pipeline" && kind !== "routing")
    throw new Error("Backup has an unknown kind.");
  if (raw.schemaId !== schemas[kind]) {
    throw new Error(
      `Backup is for schema ${String(raw.schemaId)}, expected ${schemas[kind]}.`,
    );
  }
  if (
    typeof raw.objectId !== "string" ||
    !isRecord(raw.value) ||
    typeof raw.createdAt !== "string"
  ) {
    throw new Error("Backup is missing its object id, value or timestamp.");
  }
  if (kind === "routing" && !Array.isArray(raw.value.routingEntries)) {
    throw new Error("Routing backup has no routing entries.");
  }
  if (kind === "pipeline" && typeof raw.value.customId !== "string") {
    throw new Error("Pipeline backup has no customId.");
  }
  return raw as unknown as BackupFile;
}

/** `tag` names the profile's pipeline so files from several profiles are told apart on disk. */
export function backupFileName(
  kind: BackupKind,
  createdAt: string,
  tag?: string,
): string {
  const safeTag = tag ? `-${tag.replace(/[^A-Za-z0-9_-]/g, "_")}` : "";
  return `severity-assistant-${kind}${safeTag}-backup-${createdAt.replace(/[:.]/g, "-")}.json`;
}

/** Triggers a browser download so the backup lives outside the tenant. */
export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFileName(
    backup.kind,
    backup.createdAt,
    typeof backup.value.customId === "string"
      ? backup.value.customId
      : undefined,
  );
  a.click();
  URL.revokeObjectURL(url);
}
