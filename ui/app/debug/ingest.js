// DEBUG-ONLY. Sends the fixture events with the user's own dtctl OAuth identity (no API token):
//   dtctl exec function -f ui/app/debug/ingest.js --payload '<json from the Debug panel>'
// The payload is { "events": [ { eventType, title, properties } ... ] }.
import { eventsClient } from "@dynatrace-sdk/client-classic-environment-v2";

export default async function (event) {
  const events = event?.payload?.events ?? event?.events ?? [];
  const results = [];
  for (const body of events) {
    const res = await eventsClient.createEvent({ body });
    results.push({
      title: body.title,
      case: body.properties?.["sa.case"],
      status: res.eventIngestResults?.[0]?.status,
    });
  }
  return results;
}
