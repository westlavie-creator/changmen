import * as db from "@changmen/db";
import { rebuildOnce } from "./rebuild.js";
import { invalidateMatcherRdsSnapshot } from "./rds_snapshot_cache.js";
import "../lib/env.js";

/**
 * 恢复已归档的 client_matches：从 history 表移回主表，并 rebuild。
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
      rebuild: null,
    };
  }

  // rebuild 会重新合并，不需要从 history 恢复行
  invalidateMatcherRdsSnapshot(["clientMatches", "platformMatches"]);
  const rebuild = await rebuildOnce({ afterInFlight: true });

  return {
    ok: true,
    id: cmId,
    title: "",
    restored: true,
    rebuild,
  };
}

export { restoreClientMatch };
