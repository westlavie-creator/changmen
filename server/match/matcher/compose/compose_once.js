import * as db from "@changmen/db";
import {
  isComposerForceReanchor,
  isComposerStickyOrientation,
  isComposerWriteEnabled,
} from "../lib/config.js";
import "../lib/env_composer.js";
import { writeComposerHeartbeat } from "../lib/heartbeat.js";
import { assertComposerMayWrite } from "../lib/write_guard.js";
import { loadSnapshot } from "./io/snapshot.js";
import { snapshotFromVenuesOnly } from "./io/venues_only.js";
import { writeClientMatches } from "./io/write.js";
import { composeFromSnapshot, resolveAndProject } from "./pipeline.js";

/**
 * M1：匹配缺口 ≠ 结束。
 * 返回本拍应传给写库的 markEndedIds（恒为空；结束只靠 endedRows）以及仅供日志的 activeGaps。
 */
export function resolveComposeEndPatch({ previousActiveIds = [], info = [], endedRows = [] } = {}) {
  const activeIds = new Set(
    (info || []).map(m => Number(m.ID)).filter(id => Number.isFinite(id) && id > 0),
  );
  const endedIds = new Set(
    (endedRows || []).map(m => Number(m.ID)).filter(id => Number.isFinite(id) && id > 0),
  );
  const activeGaps = (previousActiveIds || [])
    .map(Number)
    .filter(id => Number.isFinite(id) && id > 0 && !activeIds.has(id) && !endedIds.has(id));
  return { markEndedIds: [], activeGaps };
}

/**
 * 空写策略（防误清活跃集）：
 * - info 非空 → 放行
 * - ALLOW_EMPTY_WRITE=1 → 强制放行
 * - endedCount>0 且本拍处理过的正 ID 覆盖 RDS 全部 active → 允许全部标 ended
 * - 其余（含 ended>0 但未覆盖全部 active）→ 拒写
 */
export function shouldAllowEmptyWrite({
  info,
  endedCount,
  allowEmptyWrite,
  processedActiveIds,
  previousActiveIds,
} = {}) {
  if (info?.length)
    return { ok: true, reason: "nonempty" };
  if (allowEmptyWrite)
    return { ok: true, reason: "forced" };

  const ended = Number(endedCount) || 0;
  if (ended <= 0)
    return { ok: false, reason: "empty_without_ended" };

  const prev = [...(previousActiveIds || [])].filter(id => Number.isFinite(id) && id > 0);
  const processed = processedActiveIds instanceof Set
    ? processedActiveIds
    : new Set(processedActiveIds || []);

  if (!prev.length) {
    // RDS 本就无 active：空写无害
    return { ok: true, reason: "all_ended_no_previous" };
  }

  const uncovered = prev.filter(id => !processed.has(id));
  if (uncovered.length) {
    return {
      ok: false,
      reason: "empty_but_unprocessed_actives",
      uncoveredCount: uncovered.length,
    };
  }
  return { ok: true, reason: "all_ended_covered" };
}

/**
 * 一次合场。默认不写库（MATCH_COMPOSER_WRITE=1 才写）。
 * @param {boolean} [opts.fromVenuesOnly] 忽略 RDS client_matches / 绑定 / sticky，纯场馆合场（检验用；禁止写库）
 */
export async function composeOnce({
  write = isComposerWriteEnabled(),
  registerTeams = true,
  forceReanchorOrientation = isComposerForceReanchor(),
  stickyOrientation = isComposerStickyOrientation() ? true : undefined,
  viaMatcherWriter = false,
  allowEmptyWrite = String(process.env.MATCH_COMPOSER_ALLOW_EMPTY_WRITE || "").trim() === "1",
  fromVenuesOnly = false,
} = {}) {
  if (fromVenuesOnly && write) {
    throw new Error("[match-composer] fromVenuesOnly 仅用于检验，禁止写库");
  }

  let snapshot = await loadSnapshot({ registerTeams });
  if (fromVenuesOnly)
    snapshot = snapshotFromVenuesOnly(snapshot);

  const { list, alignStats, skippedBindings } = composeFromSnapshot(snapshot, {
    fromVenuesOnly,
  });

  const adapter = write && db.isMatcherStoreReady()
    ? db.getClientMatchIdAdapter()
    : null;

  const {
    info,
    endedRows = [],
    projectStats,
    endedCount,
    mergedDuplicateIds,
    processedActiveIds,
  } = await resolveAndProject(list, snapshot, {
    allowInsert: !!write,
    adapter,
    forceReanchorOrientation,
    stickyOrientation,
    fromVenuesOnly,
  });

  const previousActiveIds = fromVenuesOnly
    ? []
    : (snapshot.clientRows || [])
      .filter(r => r.ended_at == null && r.endedAt == null)
      .map(r => Number(r.id ?? r.ID))
      .filter(id => Number.isFinite(id) && id > 0);

  const now = Date.now();
  let wrote = false;
  let matchIdBackfill = null;
  if (write) {
    const guard = assertComposerMayWrite({
      skipMatcherHeartbeat: viaMatcherWriter === true,
    });
    if (!guard.ok)
      throw new Error(`[match-composer] ${guard.reason}`);

    const emptyOk = shouldAllowEmptyWrite({
      info,
      endedCount,
      allowEmptyWrite,
      processedActiveIds,
      previousActiveIds,
    });
    if (!emptyOk.ok) {
      throw new Error(
        `[match-composer] 拒绝空写（${emptyOk.reason}`
        + `${emptyOk.uncoveredCount ? ` uncovered=${emptyOk.uncoveredCount}` : ""}）。`
        + " 防未处理活跃场被整表归档；应急可设 MATCH_COMPOSER_ALLOW_EMPTY_WRITE=1",
      );
    }

    const { markEndedIds, activeGaps } = resolveComposeEndPatch({
      previousActiveIds,
      info,
      endedRows,
    });
    if (activeGaps.length) {
      console.warn(
        `[match-composer] active gap (not ending): ${activeGaps.slice(0, 20).join(",")}`
        + (activeGaps.length > 20 ? `…(+${activeGaps.length - 20})` : ""),
      );
    }
    const stickyEndedIds = (snapshot.clientRows || [])
      .filter(r => r.ended_at != null || r.endedAt != null)
      .map(r => Number(r.id ?? r.ID))
      .filter(id => Number.isFinite(id) && id > 0);

    await writeClientMatches(info, now, { endedRows, markEndedIds, stickyEndedIds });
    wrote = true;
    writeComposerHeartbeat({
      matchCount: info.length,
      builtAt: now,
      wrote: true,
    });

    try {
      const { backfillPlatformMatchIdsForIdMerges } = await import(
        "../ops/backfill_platform_match_ids.js"
      );
      matchIdBackfill = await backfillPlatformMatchIdsForIdMerges(info);
      if (matchIdBackfill?.updated) {
        try {
          const { invalidateMatcherRdsSnapshot } = await import(
            "../ops/rds_snapshot_cache.js"
          );
          invalidateMatcherRdsSnapshot(["platformMatches", "clientMatches"]);
        }
        catch { /* 独立进程无 cache */ }
      }
    }
    catch (err) {
      console.error("[match-composer] backfillPlatformMatchIds FAILED:", err.message);
    }
  }

  return {
    matchCount: info.length,
    builtAt: now,
    wrote,
    projectStats,
    alignStats,
    skippedBindings,
    endedCount,
    mergedDuplicateIds,
    matchIdBackfill,
    teamReg: snapshot.teamReg,
    nameSync: snapshot.nameSync,
    previousActiveIds,
    fromVenuesOnly: !!fromVenuesOnly,
    matches: snapshot.matches,
    info,
  };
}
