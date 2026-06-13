import { rebuildOnce } from "./rebuild.js";
import {
  fetchClientMatchRow,
  fetchPlatformMatchesByClientMatchId,
  deletePlatformMatchRow,
  deleteClientMatchRow,
} from "../../../packages/shared/db/matcher_store.js";

/**
 * 比赛已结束：删除 client_matches，并删除 matchs 中各平台对应的 platform_matches 行。
 */

function platformMatchKey(platform, sourceMatchId) {
  return `${platform}\0${String(sourceMatchId)}`;
}

async function deleteClientMatch(clientMatchId) {
  const cmId = Number(clientMatchId);
  if (!Number.isFinite(cmId)) throw new Error("无效的赛事 ID");

  const cm = await fetchClientMatchRow(cmId, "id, title, matchs");
  if (!cm) throw new Error("赛事不存在");

  const toDelete = new Map();
  for (const [plat, srcId] of Object.entries(cm.matchs || {})) {
    const platform = String(plat || "").trim();
    const sourceMatchId = String(srcId ?? "").trim();
    if (!platform || !sourceMatchId) continue;
    toDelete.set(platformMatchKey(platform, sourceMatchId), { platform, source_match_id: sourceMatchId });
  }

  const linked = await fetchPlatformMatchesByClientMatchId(cmId);
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
      await deletePlatformMatchRow(row.platform, row.source_match_id);
    } catch (err) {
      throw new Error(`删除平台比赛失败 (${row.platform}:${row.source_match_id}): ${err.message}`);
    }
    deletedPlatforms.push(`${row.platform}:${row.source_match_id}`);
  }

  await deleteClientMatchRow(cmId);

  const rebuild = await rebuildOnce();

  return {
    ok: true,
    id: cmId,
    title: cm.title || "",
    platformMatchesDeleted: deletedPlatforms.length,
    deletedPlatforms,
    rebuild,
  };
}

export { deleteClientMatch };
