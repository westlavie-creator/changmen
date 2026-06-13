import { rebuildOnce } from "./rebuild.js";
import {
  fetchClientMatchRow,
  updatePlatformMatchMatchId,
  reassignPlatformMatchIds,
  deleteClientMatchRow,
} from "../../../packages/shared/db/matcher_store.js";

/**
 * 合并两条 client_matches：source 并入 target，保留 target.id。
 */

async function previewMergeClientMatches({ sourceClientMatchId, targetClientMatchId }) {
  const sourceId = Number(sourceClientMatchId);
  const targetId = Number(targetClientMatchId);
  if (!Number.isFinite(sourceId) || !Number.isFinite(targetId)) {
    throw new Error("无效的赛事 ID");
  }
  if (sourceId === targetId) throw new Error("不能合并同一条赛事");

  const source = await fetchClientMatchRow(
    sourceId,
    "id,title,game,game_id,start_time,matchs,bets",
  );
  const target = await fetchClientMatchRow(
    targetId,
    "id,title,game,game_id,start_time,matchs,bets",
  );
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

async function mergeClientMatches({ sourceClientMatchId, targetClientMatchId }) {
  const preview = await previewMergeClientMatches({
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
    await updatePlatformMatchMatchId(plat, String(srcId), targetId);
  }

  await reassignPlatformMatchIds(sourceId, targetId);
  await deleteClientMatchRow(sourceId);

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

export { previewMergeClientMatches, mergeClientMatches };
