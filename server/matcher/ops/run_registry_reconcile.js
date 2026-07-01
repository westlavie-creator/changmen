/**
 * 运维手动触发 event_bindings → platform_matches 回写。
 */

import {
  fetchEventBindingsForEvents,
  pruneOrphanEventBindings,
  reconcilePlatformMatchesFromRegistry,
} from "@changmen/db";
import { invalidateMatcherRdsSnapshot } from "./rds_snapshot_cache.js";
import { matchMergeOnce } from "./match_merge_once.js";
import { isEventRegistryEnabled } from "./sync_event_registry.js";
import { isRegistryReconcileEnabled } from "./registry_reconcile.js";

async function runManualRegistryReconcile(opts = {}) {
  if (!isEventRegistryEnabled())
    throw new Error("真相表未启用（lib/config.js eventRegistry=false）");

  if (!isRegistryReconcileEnabled())
    throw new Error("真相表回写已关闭（lib/config.js registryReconcile=false）");

  const reconcile = await reconcilePlatformMatchesFromRegistry();
  const pruned = await pruneOrphanEventBindings();

  if (reconcile.updated > 0 || pruned.deleted > 0)
    invalidateMatcherRdsSnapshot(["platformMatches"]);

  let matchMerge = null;
  if (opts.matchMerge !== false) {
    matchMerge = await matchMergeOnce({ afterInFlight: true });
  }

  return {
    ok: true,
    reconcile,
    pruned,
    matchMerge: matchMerge
      ? { matchCount: matchMerge.matchCount ?? null }
      : null,
    summary: `真相表回写 platform ${reconcile.updated ?? 0} 条 · 清理孤儿绑定 ${pruned.deleted ?? 0} 条`,
  };
}

export {
  runManualRegistryReconcile,
};
