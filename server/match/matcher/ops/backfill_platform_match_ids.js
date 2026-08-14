/**
 * matchMerge 后将 client_matches.matchs 回写到 platform_matches.match_id。
 * 队名合并 / 人工确认 / ID 合并均覆盖；已有不同 match_id 的行跳过（保留人工锁定）。
 * PB：同 rot_num sibling 一并回写（认场合并，不改 SourceMatchID）。
 */

import { setPlatformMatchId } from "@changmen/db";
import { isComposerPbRotnumCollapse } from "../lib/config.js";
import { listPbRotNumSiblings } from "../compose/normalize/pb_rotnum_collapse.js";

function sourceIdsToBackfill(cm, matches) {
  const out = [];
  const seen = new Set();
  for (const [plat, srcId] of Object.entries(cm.Matchs || {})) {
    const sid = String(srcId);
    const key = `${plat}:${sid}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    out.push({ plat, srcId: sid });
    if (plat !== "PB" || !isComposerPbRotnumCollapse())
      continue;
    for (const sib of listPbRotNumSiblings(matches, sid)) {
      const sibKey = `PB:${sib}`;
      if (seen.has(sibKey))
        continue;
      seen.add(sibKey);
      out.push({ plat: "PB", srcId: sib });
    }
  }
  return out;
}

async function backfillPlatformMatchIdsForIdMerges(clientMatchRows, matches = {}) {
  if (!clientMatchRows?.length) {
    return { updated: 0, skipped: 0, conflicts: 0 };
  }

  let updated = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const cm of clientMatchRows) {
    const cmId = Number(cm.ID);
    if (!Number.isFinite(cmId))
      continue;

    for (const { plat, srcId } of sourceIdsToBackfill(cm, matches)) {
      const { updated: did, skipped: skip, conflict } = await setPlatformMatchId(
        plat,
        srcId,
        cmId,
        { onlyIfNull: true },
      );
      if (conflict) {
        conflicts++;
        console.warn(
          `[matchMerge] platform_matches ${plat}:${srcId} 已有其他 match_id，跳过回写 ${cmId}`,
        );
      }
      else if (did) {
        updated++;
      }
      else if (skip) {
        skipped++;
      }
    }
  }

  return { updated, skipped, conflicts };
}

export { backfillPlatformMatchIdsForIdMerges, sourceIdsToBackfill };
