/**
 * event_bindings 与物化行一致性校验 / 真相表回写后的 reconcile。
 */

import {
  pruneOrphanEventBindings,
  reconcilePlatformMatchesFromRegistry,
} from "@changmen/db";
import { isEventRegistryEnabled } from "./sync_event_registry.js";

function isRegistryReconcileEnabled() {
  if (!isEventRegistryEnabled())
    return false;
  return String(process.env.MATCHER_REGISTRY_RECONCILE ?? "1").trim() !== "0";
}

/**
 * 比对 merge 产物 matchs 槽位与 event_bindings 是否一致（纯函数，供测试）。
 * @param {object[]} publishedRows merge 发布行
 * @param {object[]} registryBindings fetchEventBindingsForEvents 结果
 */
function validateEventRegistryConsistency(publishedRows, registryBindings) {
  const byEvent = new Map();
  for (const row of publishedRows || []) {
    const id = Number(row.ID);
    if (!Number.isFinite(id))
      continue;
    byEvent.set(id, row.Matchs || {});
  }

  const bindingsByEvent = new Map();
  for (const b of registryBindings || []) {
    const eid = Number(b.event_id);
    if (!bindingsByEvent.has(eid))
      bindingsByEvent.set(eid, []);
    bindingsByEvent.get(eid).push(b);
  }

  const mismatches = [];
  for (const [eventId, matchs] of byEvent) {
    const bindings = bindingsByEvent.get(eventId) || [];
    const bindingMap = new Map(
      bindings.map(b => [b.platform, String(b.source_match_id)]),
    );

    for (const [plat, srcId] of Object.entries(matchs)) {
      const bound = bindingMap.get(plat);
      if (bound == null) {
        mismatches.push({ event_id: eventId, platform: plat, issue: "missing_binding", expected: String(srcId) });
        continue;
      }
      if (bound !== String(srcId)) {
        mismatches.push({
          event_id: eventId,
          platform: plat,
          issue: "source_mismatch",
          expected: String(srcId),
          actual: bound,
        });
      }
      bindingMap.delete(plat);
    }

    for (const [plat, srcId] of bindingMap) {
      mismatches.push({ event_id: eventId, platform: plat, issue: "extra_binding", actual: srcId });
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}

async function reconcileEventRegistryAfterMerge({ publishedRows, registryBindings }) {
  if (!isRegistryReconcileEnabled())
    return { skipped: true };

  const validation = validateEventRegistryConsistency(publishedRows, registryBindings);
  const reconcile = await reconcilePlatformMatchesFromRegistry();
  const pruned = await pruneOrphanEventBindings();

  return {
    validation,
    reconcile,
    pruned,
  };
}

export {
  isRegistryReconcileEnabled,
  reconcileEventRegistryAfterMerge,
  validateEventRegistryConsistency,
};
