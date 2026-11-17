import {
  deletePipeline,
  readLivePipeline,
  readRouting,
  writeRouting,
} from "./pipelineApi";
import { planRemoveRoute } from "./routing";

/**
 * Removes one pipeline from the tenant: its routing entry first (so no event is routed to a
 * pipeline that is about to disappear), then the pipeline itself. Both are read fresh because the
 * writes are version-checked. Returns false when there was no such pipeline. Other routes and
 * pipelines are never touched.
 */
export async function uninstallPipeline(customId: string): Promise<boolean> {
  const live = await readLivePipeline(customId);
  if (!live) return false;
  const routing = await readRouting();
  const removal = planRemoveRoute(routing.value.routingEntries, live.objectId);
  if (removal.hadRoute) await writeRouting(routing, removal.entries);
  await deletePipeline(live);
  return true;
}
