/**
 * 合场主链路：
 * align → cluster → dry IDs → dedupe → project → shape → multi → ended
 * →（写库时）仅对存活行 insert stub，避免 orphan。
 */
import {
  alignUnmatchedToClientMatches,
  buildExistingClientIdKeyIndex,
} from "../../matcher/ops/align_unmatched_to_client.js";
import {
  applyPlatformBindings,
  clusterByGbThenName,
  MIN_PLATFORMS,
} from "./cluster/merge_clusters.js";
import { resolveIdsDryRun, resolveIdsForWrite } from "./ids/resolve_ids.js";
import { dedupeRowsById } from "./ids/dedupe_rows.js";
import { projectList } from "./sides/project_sources.js";
import { applyLiveShape, filterMultiPlatform } from "./shape/live_shape.js";
import {
  buildPmSportByClientId,
  filterActiveClientMatches,
} from "./shape/ended_filter.js";

export function composeFromSnapshot(snapshot, opts = {}) {
  const fromVenuesOnly = !!opts.fromVenuesOnly || !!snapshot._fromVenuesOnly;
  const {
    matches,
    clientRows: rawClientRows,
    alignClientRows: rawAlignRows,
    platformBindingsByClientId: rawBindings,
  } = snapshot;

  const clientRows = fromVenuesOnly ? [] : (rawClientRows || []);
  const alignClientRows = fromVenuesOnly ? [] : (rawAlignRows || []);
  const platformBindingsByClientId = fromVenuesOnly ? null : rawBindings;

  const alignRows = alignClientRows?.length ? alignClientRows : clientRows;
  const alignStats = fromVenuesOnly
    ? { skipped: true, reason: "fromVenuesOnly" }
    : alignUnmatchedToClientMatches(matches, alignRows);

  let list = clusterByGbThenName(matches, clientRows);
  const bound = applyPlatformBindings(list, platformBindingsByClientId, matches);
  list = bound.list;

  return {
    list,
    alignStats,
    skippedBindings: bound.skippedBindings || 0,
    fromVenuesOnly,
  };
}

/** 负/非法临时 ID 清空，供写库路径真正 insert */
function stripTempIds(rows) {
  return (rows || []).map((row) => {
    const id = Number(row.ID);
    if (Number.isFinite(id) && id > 0)
      return row;
    const next = { ...row };
    delete next.ID;
    return next;
  });
}

export async function resolveAndProject(list, snapshot, opts = {}) {
  const fromVenuesOnly = !!opts.fromVenuesOnly || !!snapshot._fromVenuesOnly;
  const {
    allowInsert = false,
    adapter = null,
    forceReanchorOrientation = false,
    stickyOrientation,
  } = opts;
  const {
    matches,
    bets,
    timers,
  } = snapshot;

  const clientRows = fromVenuesOnly ? [] : (snapshot.clientRows || []);
  const alignClientRows = fromVenuesOnly ? [] : (snapshot.alignClientRows || []);
  const platformOverrides = fromVenuesOnly ? {} : (snapshot.platformOverrides || {});

  const alignRows = alignClientRows?.length ? alignClientRows : clientRows;
  const existingIdKeyIndex = fromVenuesOnly
    ? new Map()
    : buildExistingClientIdKeyIndex(alignRows, matches);

  // 始终先 dry：不 insert；滤空后再对存活行写 stub
  let info = resolveIdsDryRun(list, {
    matches,
    existingClientRows: clientRows,
    existingIdKeyIndex,
  });

  const deduped = dedupeRowsById(info);
  info = deduped.list;
  info = info.filter(r => Object.keys(r.Matchs || {}).length >= MIN_PLATFORMS);

  const projectStats = projectList(info, {
    matches,
    bets,
    existingClientRows: clientRows,
    platformOverrides,
    forceReanchorOrientation: fromVenuesOnly ? true : forceReanchorOrientation,
    // 纯场馆：禁止 sticky / existing 朝向
    stickyOrientation: fromVenuesOnly ? false : stickyOrientation,
  });

  applyLiveShape(info, { matches, timers });
  info = filterMultiPlatform(info, MIN_PLATFORMS);

  /** ended 过滤前：本拍已纳入活跃集的正 ID（用于空写安全判定） */
  const processedActiveIds = new Set(
    info.map(r => Number(r.ID)).filter(id => Number.isFinite(id) && id > 0),
  );
  const preEndedCount = info.length;

  const pmSportByClientId = fromVenuesOnly
    ? new Map()
    : buildPmSportByClientId(clientRows);
  const ended = filterActiveClientMatches(info, {
    platformMatches: matches,
    timersByProvider: timers,
    pmSportByClientId,
  });
  info = ended.list;

  if (allowInsert && adapter && info.length) {
    if (fromVenuesOnly) {
      throw new Error("[match-composer] fromVenuesOnly 禁止写库");
    }
    info = await resolveIdsForWrite(adapter, stripTempIds(info), {
      matches,
      existingIdKeyIndex,
    });
  }

  return {
    info,
    projectStats,
    endedCount: ended.endedCount,
    mergedDuplicateIds: deduped.mergedCount,
    preEndedCount,
    processedActiveIds,
    fromVenuesOnly,
  };
}
