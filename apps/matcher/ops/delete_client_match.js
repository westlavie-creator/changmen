import "../lib/env.js";
import { rebuildOnce } from "./rebuild.js";
import * as db from "@changmen/db";
import { CLIENT_MATCH_LIST_HIDDEN } from "@changmen/db";

/**
 * 比赛已结束：list_status = -1（浏览器不返回），并删除各平台 platform_matches 行。
 */

function platformMatchKey(platform, sourceMatchId) {
  return `${platform}\0${String(sourceMatchId)}`;
}

async function deleteClientMatch(clientMatchId) {
  const cmId = Number(clientMatchId);
  if (!Number.isFinite(cmId)) throw new Error("无效的赛事 ID");

  const cm = await db.fetchClientMatchRow(cmId, "id, title, matchs, list_status");
  if (!cm) throw new Error("赛事不存在");
  if (Number(cm.list_status) === CLIENT_MATCH_LIST_HIDDEN) {
    return {
      ok: true,
      id: cmId,
      title: cm.title || "",
      list_status: CLIENT_MATCH_LIST_HIDDEN,
      platformMatchesDeleted: 0,
      deletedPlatforms: [],
      alreadyHidden: true,
      rebuild: null,
    };
  }

  const toDelete = new Map();
  for (const [plat, srcId] of Object.entries(cm.matchs || {})) {
    const platform = String(plat || "").trim();
    const sourceMatchId = String(srcId ?? "").trim();
    if (!platform || !sourceMatchId) continue;
    toDelete.set(platformMatchKey(platform, sourceMatchId), { platform, source_match_id: sourceMatchId });
  }

  const linked = await db.fetchPlatformMatchesByClientMatchId(cmId);
  for (const row of linked || []) {
    const platform = String(row.platform || "").trim();
    const sourceMatchId = String(row.source_match_id ?? "").trim();
    if (!platform || !sourceMatchId) continue;
    toDelete.set(platformMatchKey(platform, sourceMatchId), { platform, source_match_id: sourceMatchId });
  }

  const platformRows = [...toDelete.values()];
  const deletedPlatforms = [];
  for (const row of platformRows) {
    try {
      await db.deletePlatformMatchRow(row.platform, row.source_match_id);
    } catch (err) {
      throw new Error(`删除平台比赛失败 (${row.platform}:${row.source_match_id}): ${err.message}`);
    }
    deletedPlatforms.push(`${row.platform}:${row.source_match_id}`);
  }

  const hidden = await db.setClientMatchListStatus(cmId, CLIENT_MATCH_LIST_HIDDEN);

  const rebuild = await rebuildOnce();

  return {
    ok: true,
    id: cmId,
    title: cm.title || "",
    list_status: hidden.list_status,
    platformMatchesDeleted: deletedPlatforms.length,
    deletedPlatforms,
    rebuild,
  };
}

export { deleteClientMatch };
