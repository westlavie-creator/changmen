import * as db from "@changmen/db";
import { matchMergeOnce } from "./match_merge_once.js";
import { invalidateMatcherRdsSnapshot } from "./rds_snapshot_cache.js";
import "../lib/env.js";

/**
 * 恢复已归档的 client_matches：从 history 表移回主表，并 matchMerge。
 */

async function restoreClientMatch(clientMatchId) {
  const cmId = Number(clientMatchId);
  if (!Number.isFinite(cmId))
    throw new Error("无效的赛事 ID");

  const cm = await db.fetchClientMatchRow(cmId, "id, title");
  if (cm) {
    return {
      ok: true,
      id: cmId,
      title: cm.title || "",
      alreadyVisible: true,
      matchMerge: null,
    };
  }

  // matchMerge 会重新合并，不需要从 history 恢复行
  invalidateMatcherRdsSnapshot(["clientMatches", "platformMatches"]);
  const matchMerge = await matchMergeOnce({ afterInFlight: true });

  return {
    ok: true,
    id: cmId,
    title: "",
    restored: true,
    matchMerge,
  };
}

export { restoreClientMatch };
