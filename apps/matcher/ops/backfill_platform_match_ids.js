/**
 * 队伍 ID 自动合并成功后，将 client_match id 回写到 platform_matches.match_id。
 * 仅处理 MergeBasis === "id"；已有不同 match_id 的行跳过（保留人工锁定）。
 */

import { setPlatformMatchId } from "../../../packages/shared/db/supabase.js";

async function backfillPlatformMatchIdsForIdMerges(_client, clientMatchRows) {
  if (!clientMatchRows?.length) {
    return { updated: 0, skipped: 0, conflicts: 0 };
  }

  let updated = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const cm of clientMatchRows) {
    if (cm.MergeBasis !== "id") continue;
    const cmId = Number(cm.ID);
    if (!Number.isFinite(cmId)) continue;

    for (const [plat, srcId] of Object.entries(cm.Matchs || {})) {
      const { updated: did, skipped: skip, conflict } = await setPlatformMatchId(
        plat,
        srcId,
        cmId,
        { onlyIfNull: true },
      );
      if (conflict) {
        conflicts++;
        console.warn(
          `[rebuild] platform_matches ${plat}:${srcId} 已有其他 match_id，跳过回写 ${cmId}`,
        );
      } else if (did) updated++;
      else if (skip) skipped++;
    }
  }

  return { updated, skipped, conflicts };
}

export { backfillPlatformMatchIdsForIdMerges };
