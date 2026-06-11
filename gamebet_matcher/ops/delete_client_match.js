"use strict";

/**
 * 比赛已结束：删除 client_matches，并删除 matchs 中各平台对应的 platform_matches 行。
 */

const { rebuildOnce } = require("./rebuild");

function platformMatchKey(platform, sourceMatchId) {
  return `${platform}\0${String(sourceMatchId)}`;
}

async function deleteClientMatch(supabase, clientMatchId) {
  const cmId = Number(clientMatchId);
  if (!Number.isFinite(cmId)) throw new Error("无效的赛事 ID");

  const { data: cm, error: cmErr } = await supabase
    .from("client_matches")
    .select("id, title, matchs")
    .eq("id", cmId)
    .maybeSingle();
  if (cmErr) throw new Error(cmErr.message);
  if (!cm) throw new Error("赛事不存在");

  const toDelete = new Map();
  for (const [plat, srcId] of Object.entries(cm.matchs || {})) {
    const platform = String(plat || "").trim();
    const sourceMatchId = String(srcId ?? "").trim();
    if (!platform || !sourceMatchId) continue;
    toDelete.set(platformMatchKey(platform, sourceMatchId), { platform, source_match_id: sourceMatchId });
  }

  const { data: linked, error: linkedErr } = await supabase
    .from("platform_matches")
    .select("platform, source_match_id")
    .eq("match_id", cmId);
  if (linkedErr) throw new Error(`查询平台比赛失败: ${linkedErr.message}`);
  for (const row of linked || []) {
    const platform = String(row.platform || "").trim();
    const sourceMatchId = String(row.source_match_id ?? "").trim();
    if (!platform || !sourceMatchId) continue;
    toDelete.set(platformMatchKey(platform, sourceMatchId), { platform, source_match_id: sourceMatchId });
  }

  const platformRows = [...toDelete.values()];
  const deletedPlatforms = [];
  for (const row of platformRows) {
    const { error: pmErr } = await supabase
      .from("platform_matches")
      .delete()
      .eq("platform", row.platform)
      .eq("source_match_id", row.source_match_id);
    if (pmErr) {
      throw new Error(`删除平台比赛失败 (${row.platform}:${row.source_match_id}): ${pmErr.message}`);
    }
    deletedPlatforms.push(`${row.platform}:${row.source_match_id}`);
  }

  const { error: delErr } = await supabase.from("client_matches").delete().eq("id", cmId);
  if (delErr) throw new Error(`删除赛事失败: ${delErr.message}`);

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

module.exports = { deleteClientMatch };
