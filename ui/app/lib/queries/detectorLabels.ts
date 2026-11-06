/**
 * `dt.settings.object_id` on a Davis event is the objectId of whichever settings object raised it:
 * not only `builtin:davis.anomaly-detectors` but also e.g. `builtin:os-services-monitoring`. The id
 * is a base64 blob that embeds the schema id, the scope type and the scope's entity id, so even
 * before any lookup a readable fallback can be derived from the id alone.
 */

export interface DecodedObjectId {
  schemaId: string;
  scopeType?: string;
  scopeId?: string;
}

function toText(id: string): string | null {
  try {
    const b64 = id.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

export function decodeSettingsObjectId(id: string): DecodedObjectId | null {
  const text = toText(id);
  if (!text) return null;
  // Segments are NUL-separated with a length byte in front: schema, scope type, scope id, uuid.
  const parts = text.split("\u0000").map((p) => p.replace(/[^\x20-\x7e]/g, ""));
  const schemaId = parts.find(
    (p) =>
      /^(builtin:|app:|[a-z][a-z0-9-]*\.[a-z0-9.-]+)/i.test(p) &&
      p.includes(":"),
  );
  if (!schemaId) return null;
  const rest = parts.slice(parts.indexOf(schemaId) + 1).filter(Boolean);
  return { schemaId, scopeType: rest[0], scopeId: rest[1] };
}

/** "builtin:os-services-monitoring" -> "os-services-monitoring". */
const shortSchema = (schemaId: string) => schemaId.replace(/^builtin:/, "");

/** What to show before (or without) a name lookup. */
export function fallbackDetectorLabel(id: string): string {
  const d = decodeSettingsObjectId(id);
  if (!d) return id;
  return `${shortSchema(d.schemaId)}${d.scopeType ? ` (${d.scopeType} ${d.scopeId ?? ""})` : ""}`.trim();
}
