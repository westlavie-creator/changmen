import * as db from "@changmen/db";
import { removeClientMatchFromMemory } from "../../backend/core/db/store.js";
import store from "../../backend/core/esport-api/store.js";
import { invalidateMatcherRdsSnapshot } from "./rds_snapshot_cache.js";
import { rebuildOnce } from "./rebuild.js";
import "../lib/env.js";

/**
 * 比赛已结束：归档到 history 表，并删除各平台 platform_matches 行。
 */

function platformMatchKey(platform, sourceMatchId) {
  return `${platform}\0${String(sourceMatchId)}`;
}

async function clientMatchToHistory(clientMatchId) {
  const cmId = Number(clientMatchId);
  if (!Number.isFinite(cmId))
    throw new Error("无效的赛事 ID");

  const cm = await db.fetchClientMatchRow(cmId, "id, title, matchs");
  if (!cm)
    throw new Error("赛事不存在");

  const toDelete = new Map();
  for (const [plat, srcId] of Object.entries(cm.matchs || {})) {
    const platform = String(plat || "").trim();
    const sourceMatchId = String(srcId ?? "").trim();
    if (!platform || !sourceMatchId)
      continue;
    toDelete.set(platformMatchKey(platform, sourceMatchId), { platform, source_match_id: sourceMatchId });
  }

  const linked = await db.fetchPlatformMatchesByClientMatchId(cmId);
  for (const row of linked || []) {
    const platform = String(row.platform || "").trim();
    const sourceMatchId = String(row.source_match_id ?? "").trim();
    if (!platform || !sourceMatchId)
      continue;
    toDelete.set(platformMatchKey(platform, sourceMatchId), { platform, source_match_id: sourceMatchId });
  }

  const platformRows = [...toDelete.values()];
  const deletedPlatforms = [];
  for (const row of platformRows) {
    try {
      await db.deletePlatformMatchRow(row.platform, row.source_match_id);
    }
    catch (err) {
      throw new Error(`删除平台比赛失败 (${row.platform}:${row.source_match_id}): ${err.message}`);
    }
    store.removeCollectorPlatformMatch(row.platform, row.source_match_id);
    deletedPlatforms.push(`${row.platform}:${row.source_match_id}`);
  }

  await db.archiveClientMatch(cmId);
  removeClientMatchFromMemory(cmId);

  invalidateMatcherRdsSnapshot(["platformMatches", "clientMatches"]);
  const rebuild = await rebuildOnce({ afterInFlight: true });

  return {
    ok: true,
    id: cmId,
    title: cm.title || "",
    archived: true,
    platformMatchesDeleted: deletedPlatforms.length,
    deletedPlatforms,
    rebuild,
  };
}

export { clientMatchToHistory };
