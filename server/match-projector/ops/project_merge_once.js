import * as db from "@changmen/db";
import { isProjectorWriteEnabled } from "../lib/config.js";
import "../lib/env.js";
import { assertProjectorMayWrite } from "../lib/write_guard.js";
import { reprojectMergedList } from "../src/reproject_client_matches.js";

/**
 * 复用旧 matcher 的合场骨架，再用投影层覆盖 Sources/Reverse/锁规则。
 * 默认不写库（MATCH_PROJECTOR_WRITE=1 才写）。
 *
 * 生产接替优先用 MATCHER_SIDE_ENGINE=projector（挂在 matchMergeOnce 内），
 * 本独立入口用于 dry-run / diff / 并行验证。
 */
export async function projectMergeOnce({
  write = isProjectorWriteEnabled(),
  registerTeams = true,
  forceReanchorOrientation = String(process.env.MATCH_PROJECTOR_REANCHOR || "").trim() === "1",
  stickyOrientation = String(process.env.MATCH_PROJECTOR_STICKY_ORIENTATION || "").trim() === "1"
    ? true
    : undefined,
} = {}) {
  const { computeMatchMergeList, ensureTeamPlugin } = await import(
    "../../matcher/ops/match_merge_once.js"
  );
  await ensureTeamPlugin();

  const {
    info,
    alignStats,
    endedCount,
    hotCollector,
    teamReg,
    nameSync,
    clientRows,
    matches,
    bets,
    timers,
  } = await computeMatchMergeList({ registerTeams });

  const platformOverrides = db.isMatcherStoreReady()
    ? await db.fetchClientMatchPlatformOverrides()
    : {};

  const projectStats = reprojectMergedList(info, {
    matches,
    bets,
    timers,
    existingClientRows: clientRows,
    platformOverrides,
    forceReanchorOrientation,
    stickyOrientation,
  });

  const now = Date.now();
  let wrote = false;
  let matchIdBackfill = null;
  if (write) {
    const guard = assertProjectorMayWrite();
    if (!guard.ok) {
      throw new Error(`[match-projector] ${guard.reason}`);
    }
    if (!db.isMatcherStoreReady()) {
      throw new Error("MATCH_PROJECTOR_WRITE=1 但数据库未配置");
    }
    // 与 matchMergeOnce(projector) 一致：投影后重跑 trim/gate
    const {
      trimMapZeroToObOnDeciderRound,
      applyObLiveRoundGate,
      stripOrphanClientMatchPlatforms,
      refreshClientMatchBetNames,
      sortClientMatchBets,
    } = await import("@changmen/match-engine");
    trimMapZeroToObOnDeciderRound(info);
    applyObLiveRoundGate(info, matches, timers);
    stripOrphanClientMatchPlatforms(info, matches);
    refreshClientMatchBetNames(info);
    sortClientMatchBets(info);

    const { clientMatchWriteRow } = await import("../src/write_payload.js");
    await db.writeClientMatchesAsync(
      info.map(m => clientMatchWriteRow(m, now)),
    );
    wrote = true;

    // 与 matchMergeOnce 写后置对齐（接替时缺任一项都会漂）
    try {
      const { setClientMatchesFromMatchMerge } = await import(
        "../../backend/core/db/store.js"
      );
      const { isEmbeddedMatcher } = await import(
        "../../backend/core/shared/matcher_mode.js"
      );
      if (isEmbeddedMatcher())
        setClientMatchesFromMatchMerge(info, now);
    }
    catch {
      /* 独立进程可不注入 */
    }

    try {
      const store = (await import("../../backend/core/esport-api/store.js")).default;
      store.patchCollectorMatchClientIds(info);
    }
    catch (err) {
      console.warn("[match-projector] patchCollectorMatchClientIds:", err.message);
    }

    try {
      const { invalidateMatcherRdsSnapshot } = await import(
        "../../matcher/ops/rds_snapshot_cache.js"
      );
      invalidateMatcherRdsSnapshot(["clientMatches"]);
      const { backfillPlatformMatchIdsForIdMerges } = await import(
        "../../matcher/ops/backfill_platform_match_ids.js"
      );
      matchIdBackfill = await backfillPlatformMatchIdsForIdMerges(info);
      if (matchIdBackfill?.updated)
        invalidateMatcherRdsSnapshot(["platformMatches"]);
    }
    catch (err) {
      console.warn("[match-projector] post-write hooks:", err.message);
    }
  }

  return {
    matchCount: info.length,
    builtAt: now,
    wrote,
    projectStats,
    alignStats,
    endedCount,
    hotCollector,
    teamReg,
    nameSync,
    matchIdBackfill,
    info,
  };
}
