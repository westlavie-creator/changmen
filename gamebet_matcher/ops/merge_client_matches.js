"use strict";

/**
 * 合并两条 client_matches：source 并入 target，保留 target.id。
 */

const { rebuildOnce } = require("./rebuild");

async function previewMergeClientMatches(supabase, { sourceClientMatchId, targetClientMatchId }) {
  const sourceId = Number(sourceClientMatchId);
  const targetId = Number(targetClientMatchId);
  if (!Number.isFinite(sourceId) || !Number.isFinite(targetId)) {
    throw new Error("无效的赛事 ID");
  }
  if (sourceId === targetId) throw new Error("不能合并同一条赛事");

  const [{ data: source, error: sErr }, { data: target, error: tErr }] = await Promise.all([
    supabase.from("client_matches").select("id,title,game,game_id,start_time,matchs,bets").eq("id", sourceId).maybeSingle(),
    supabase.from("client_matches").select("id,title,game,game_id,start_time,matchs,bets").eq("id", targetId).maybeSingle(),
  ]);
  if (sErr) throw new Error(sErr.message);
  if (tErr) throw new Error(tErr.message);
  if (!source) throw new Error("源赛事不存在");
  if (!target) throw new Error("目标赛事不存在");

  const sourceMatchs = source.matchs || {};
  const targetMatchs = target.matchs || {};
  const conflicts = [];
  for (const [plat, srcId] of Object.entries(sourceMatchs)) {
    const existing = targetMatchs[plat];
    if (existing != null && String(existing) !== String(srcId)) {
      conflicts.push({ platform: plat, sourceMatchId: String(srcId), targetMatchId: String(existing) });
    }
  }

  const mergedPlatformSet = new Set([
    ...Object.keys(sourceMatchs),
    ...Object.keys(targetMatchs),
  ]);

  return {
    sourceClientMatchId: sourceId,
    targetClientMatchId: targetId,
    source: {
      id: sourceId,
      title: source.title || "",
      matchs: sourceMatchs,
      platforms: Object.keys(sourceMatchs),
    },
    target: {
      id: targetId,
      title: target.title || "",
      matchs: targetMatchs,
      platforms: Object.keys(targetMatchs),
    },
    conflicts,
    mergedPlatforms: [...mergedPlatformSet],
    canMerge: conflicts.length === 0,
  };
}

async function mergeClientMatches(supabase, { sourceClientMatchId, targetClientMatchId }) {
  const preview = await previewMergeClientMatches(supabase, {
    sourceClientMatchId,
    targetClientMatchId,
  });
  if (!preview.canMerge) {
    const names = preview.conflicts.map((c) => c.platform).join("、");
    throw new Error(`无法合并：${names} 在两场赛事中指向不同 platform_match`);
  }

  const sourceId = preview.sourceClientMatchId;
  const targetId = preview.targetClientMatchId;

  for (const [plat, srcId] of Object.entries(preview.source.matchs)) {
    const { error } = await supabase
      .from("platform_matches")
      .update({ match_id: targetId })
      .eq("platform", plat)
      .eq("source_match_id", String(srcId));
    if (error) throw new Error(`更新平台关联失败 (${plat}): ${error.message}`);
  }

  const { error: bulkErr } = await supabase
    .from("platform_matches")
    .update({ match_id: targetId })
    .eq("match_id", sourceId);
  if (bulkErr) throw new Error(`批量更新 platform_matches 失败: ${bulkErr.message}`);

  const { error: delErr } = await supabase.from("client_matches").delete().eq("id", sourceId);
  if (delErr) throw new Error(`删除源赛事失败: ${delErr.message}`);

  const rebuild = await rebuildOnce();

  return {
    ok: true,
    sourceClientMatchId: sourceId,
    targetClientMatchId: targetId,
    mergedPlatforms: preview.mergedPlatforms,
    rebuild,
    summary: `赛事 #${sourceId} 已并入 #${targetId}（${preview.mergedPlatforms.length} 个平台）`,
  };
}

module.exports = { previewMergeClientMatches, mergeClientMatches };
