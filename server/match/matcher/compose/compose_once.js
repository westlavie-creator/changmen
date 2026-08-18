import * as db from "@changmen/db";
import { normalizeEpochMs } from "@changmen/shared/time/match_time";
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
import {
  composeFromSnapshot,
  resolveMatchIdsForWrite,
  runEndPass,
  runMatchPass,
} from "./pipeline.js";
import {
  ALL_SOURCES_GONE_MS,
  allPlatformSourcesGone,
} from "./shape/ended_filter.js";

/** snapshot 是否含至少一条馆源（{} 与 fetch 失败回落不可区分，不能当 sources-gone） */
export function platformMatchesSnapshotNonEmpty(platformMatches) {
  if (platformMatches == null || typeof platformMatches !== "object")
    return false;
  for (const block of Object.values(platformMatches)) {
    if (!block || typeof block !== "object")
      continue;
    if (Object.keys(block).length > 0)
      return true;
  }
  return false;
}

/**
 * M1：匹配缺口 ≠ 结束。
 * 例外（根治用户侧僵尸场）：gap 且馆源在当前 snapshot 全部消失、且已过
 * ALL_SOURCES_GONE 时间门 → 才进 markEndedIds（只写 ended_at）。
 * 馆源仍在、本拍只是没合出来 → 仍只记 activeGaps，不结束。
 * 整表 platformMatches 为空（含 RDS fetch 失败返回 {}）→ 不 markEnded，避免误杀全场。
 */
export function resolveComposeEndPatch({
  previousActiveIds = [],
  info = [],
  endedRows = [],
  clientRows = [],
  platformMatches = null,
  now = Date.now(),
} = {}) {
  const activeIds = new Set(
    (info || []).map(m => Number(m.ID)).filter(id => Number.isFinite(id) && id > 0),
  );
  const endedIds = new Set(
    (endedRows || []).map(m => Number(m.ID)).filter(id => Number.isFinite(id) && id > 0),
  );
  const gaps = (previousActiveIds || [])
    .map(Number)
    .filter(id => Number.isFinite(id) && id > 0 && !activeIds.has(id) && !endedIds.has(id));

  if (!platformMatchesSnapshotNonEmpty(platformMatches)) {
    return { markEndedIds: [], activeGaps: gaps };
  }

  const byId = new Map();
  for (const row of clientRows || []) {
    const id = Number(row?.id ?? row?.ID);
    if (Number.isFinite(id) && id > 0)
      byId.set(id, row);
  }

  const markEndedIds = [];
  const activeGaps = [];
  for (const id of gaps) {
    const row = byId.get(id);
    if (!row) {
      activeGaps.push(id);
      continue;
    }
    const matchs = row.matchs ?? row.Matchs ?? {};
    const startMs = normalizeEpochMs(row.start_time ?? row.StartTime);
    if (
      startMs > 0
      && startMs <= now - ALL_SOURCES_GONE_MS
      && allPlatformSourcesGone(matchs, platformMatches)
    ) {
      markEndedIds.push(id);
    }
    else {
      activeGaps.push(id);
    }
  }
  return { markEndedIds, activeGaps };
}

/**
 * 空写策略（防误清活跃集）：
 * - info 非空 → 放行
 * - ALLOW_EMPTY_WRITE=1 → 强制放行
 * - endedCount>0 且本拍处理过的正 ID + sources-gone markEndedIds 覆盖 RDS 全部 active → 允许
 * - info 空、endedCount=0，但 markEndedIds 已覆盖全部 previous active（全是僵尸收尾）→ 允许
 * - 其余 → 拒写
 */
export function shouldAllowEmptyWrite({
  info,
  endedCount,
  allowEmptyWrite,
  processedActiveIds,
  previousActiveIds,
  markEndedIds = [],
} = {}) {
  if (info?.length)
    return { ok: true, reason: "nonempty" };
  if (allowEmptyWrite)
    return { ok: true, reason: "forced" };

  const ended = Number(endedCount) || 0;
  const prev = [...(previousActiveIds || [])].filter(id => Number.isFinite(id) && id > 0);
  const processed = processedActiveIds instanceof Set
    ? processedActiveIds
    : new Set(processedActiveIds || []);
  const marked = new Set(
    (markEndedIds || []).map(Number).filter(id => Number.isFinite(id) && id > 0),
  );

  if (!prev.length) {
    // RDS 本就无 active：空写无害
    return { ok: true, reason: "all_ended_no_previous" };
  }

  const uncovered = prev.filter(id => !processed.has(id) && !marked.has(id));
  if (uncovered.length) {
    return {
      ok: false,
      reason: ended <= 0 && !marked.size
        ? "empty_without_ended"
        : "empty_but_unprocessed_actives",
      uncoveredCount: uncovered.length,
    };
  }

  if (ended <= 0 && !marked.size)
    return { ok: false, reason: "empty_without_ended" };

  if (ended <= 0 && marked.size)
    return { ok: true, reason: "all_sources_gone_covered" };

  return { ok: true, reason: "all_ended_covered" };
}

/**
 * 一次合场（M2：Match → End，分日志；写库仍一次）。
 * 默认不写库（MATCH_COMPOSER_WRITE=1 才写）。
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

  const t0 = Date.now();
  const { list, alignStats, skippedBindings } = composeFromSnapshot(snapshot, {
    fromVenuesOnly,
  });
  const clusterMs = Date.now() - t0;

  const passOpts = {
    forceReanchorOrientation,
    stickyOrientation,
    fromVenuesOnly,
  };

  const tMatch = Date.now();
  const match = runMatchPass(list, snapshot, passOpts);
  const matchMs = Date.now() - tMatch;

  const tEnd = Date.now();
  const end = runEndPass(match.info, snapshot, passOpts);
  const endMs = Date.now() - tEnd;

  let info = end.info;
  const endedRows = end.endedRows;
  const endedCount = end.endedCount;

  const adapter = write && db.isMatcherStoreReady()
    ? db.getClientMatchIdAdapter()
    : null;

  if (write && adapter && info.length) {
    info = await resolveMatchIdsForWrite(info, snapshot, {
      ...passOpts,
      adapter,
      existingIdKeyIndex: match.existingIdKeyIndex,
    });
  }

  const previousActiveIds = fromVenuesOnly
    ? []
    : (snapshot.clientRows || [])
      .filter(r => r.ended_at == null && r.endedAt == null)
      .map(r => Number(r.id ?? r.ID))
      .filter(id => Number.isFinite(id) && id > 0);

  console.log(
    `[match-composer] matchPass ${matchMs}ms rows=${match.preEndedCount}`
    + ` · endPass ${endMs}ms ended=${endedCount} live=${info.length}`
    + ` · cluster ${clusterMs}ms`,
  );

  const now = Date.now();
  let wrote = false;
  let matchIdBackfill = null;
  if (write) {
    const guard = assertComposerMayWrite({
      skipMatcherHeartbeat: viaMatcherWriter === true,
    });
    if (!guard.ok)
      throw new Error(`[match-composer] ${guard.reason}`);

    const { markEndedIds, activeGaps } = resolveComposeEndPatch({
      previousActiveIds,
      info,
      endedRows,
      clientRows: snapshot.clientRows,
      platformMatches: snapshot.matches,
      now,
    });
    if (markEndedIds.length) {
      console.log(
        `[match-composer] sources-gone end: ${markEndedIds.slice(0, 20).join(",")}`
        + (markEndedIds.length > 20 ? `…(+${markEndedIds.length - 20})` : ""),
      );
    }
    if (activeGaps.length) {
      console.warn(
        `[match-composer] active gap (not ending): ${activeGaps.slice(0, 20).join(",")}`
        + (activeGaps.length > 20 ? `…(+${activeGaps.length - 20})` : ""),
      );
    }

    const emptyOk = shouldAllowEmptyWrite({
      info,
      endedCount,
      allowEmptyWrite,
      processedActiveIds: match.processedActiveIds,
      previousActiveIds,
      markEndedIds,
    });
    if (!emptyOk.ok) {
      throw new Error(
        `[match-composer] 拒绝空写（${emptyOk.reason}`
        + `${emptyOk.uncoveredCount ? ` uncovered=${emptyOk.uncoveredCount}` : ""}）。`
        + " 防未处理活跃场被整表归档；应急可设 MATCH_COMPOSER_ALLOW_EMPTY_WRITE=1",
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
      // M4：只清「仍挂在 ended CM 上」的 match_id；JOIN 自愈，勿扫全表 sticky id
      if (typeof db.clearPlatformMatchIdsPointingAtEnded === "function") {
        const cleared = await db.clearPlatformMatchIdsPointingAtEnded();
        if (cleared?.cleared) {
          console.log(
            `[match-composer] cleared platform_matches.match_id pointing at ended (${cleared.cleared} rows)`,
          );
          try {
            const { invalidateMatcherRdsSnapshot } = await import(
              "../ops/rds_snapshot_cache.js"
            );
            invalidateMatcherRdsSnapshot(["platformMatches", "clientMatches"]);
          }
          catch { /* 独立进程无 cache */ }
        }
      }
    }
    catch (err) {
      console.error("[match-composer] clearPlatformMatchIds FAILED:", err.message);
    }

    try {
      const { backfillPlatformMatchIdsForIdMerges } = await import(
        "../ops/backfill_platform_match_ids.js"
      );
      matchIdBackfill = await backfillPlatformMatchIdsForIdMerges(info, snapshot.matches);
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
    projectStats: match.projectStats,
    alignStats,
    skippedBindings,
    endedCount,
    mergedDuplicateIds: match.mergedDuplicateIds,
    matchIdBackfill,
    teamReg: snapshot.teamReg,
    nameSync: snapshot.nameSync,
    previousActiveIds,
    fromVenuesOnly: !!fromVenuesOnly,
    matches: snapshot.matches,
    info,
    timing: { clusterMs, matchMs, endMs },
  };
}
