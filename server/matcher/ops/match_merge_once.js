import * as db from "@changmen/db";
import {
  applyManualMatchLinks,
  buildClientMatchList,
  buildPmSportByClientId,
  filterActiveClientMatches,
  filterMultiPlatformClientMatches,
  normalizeMatchesShape,
  resolveClientMatchIds,
  setTeamPlugin,
} from "@changmen/match-engine";
import { formatOdds } from "@changmen/shared/odds_format";
import {
  alignUnmatchedToClientMatches,
  buildExistingClientIdKeyIndex,
} from "./align_unmatched_to_client.js";
import { autoRegisterTeams } from "./auto_register_teams.js";
import { backfillPlatformMatchIdsForIdMerges } from "./backfill_platform_match_ids.js";
import { setClientMatchesFromMatchMerge } from "../../backend/core/db/store.js";
import { isEmbeddedMatcher } from "../../backend/core/shared/matcher_mode.js";
import store from "../../backend/core/esport-api/store.js";
import {
  fetchMatcherRdsSnapshot,
  enrichMatchesRawWithDbBindings,
  invalidateMatcherRdsSnapshot,
} from "./rds_snapshot_cache.js";
import { isProjectorSideEngine } from "../lib/side_engine.js";
import { isComposerWriter } from "../lib/matcher_writer.js";
import "../lib/env.js";

/**
 * 单次 matchMerge：读 platform 快照 → 跨平台合并 → finalize → 写 client_matches。
 *
 * 数据边界：本函数产出是 Client_GetMatchs 的唯一权威来源；读路径不应再 reconcile/promote/trim。
 */

let _pluginReady = null;
let _matchMergeInFlight = null;

function resetTeamPluginCache() {
  _pluginReady = null;
}

/** 队伍映射 / canonical 写入后调用，使下次 matchMerge 重载 team-resolver */
function invalidateTeamPlugin() {
  resetTeamPluginCache();
}

function sourceFromBet(provider, b) {
  return {
    Type: provider,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID || ""),
    AwayID: String(b.SourceAwayID || ""),
    HomeOdds: formatOdds(b.HomeOdds),
    AwayOdds: formatOdds(b.AwayOdds),
    Status: b.Status || "Normal",
  };
}

async function ensureTeamPlugin() {
  if (_pluginReady)
    return _pluginReady;
  _pluginReady = (async () => {
    try {
      const { loadAndCreatePlugin } = await import("@changmen/team-resolver/team_db.js");
      const plugin = await loadAndCreatePlugin();
      setTeamPlugin(plugin);
    }
    catch (err) {
      console.warn("[matchMerge] team-resolver 加载失败:", err.message);
    }
  })();
  return _pluginReady;
}

async function computeMatchMergeList({ registerTeams = true } = {}) {
  await db.initLastWrittenIds();

  const { matchesRaw, bets, timers, clientRows, alignClientRows, hotCollector } = await fetchMatcherRdsSnapshot();

  const platformBindingsByClientId = db.isMatcherStoreReady()
    ? await db.fetchAllPlatformMatchBindings()
    : null;
  if (platformBindingsByClientId?.size)
    enrichMatchesRawWithDbBindings(matchesRaw, platformBindingsByClientId);

  let teamReg = null;
  let nameSync = null;
  if (registerTeams) {
    teamReg = await autoRegisterTeams(matchesRaw);
    nameSync = await db.syncCanonicalTeamNamesFromOb();
    if ((teamReg?.registered > 0) || (nameSync?.updated > 0))
      resetTeamPluginCache();
  }
  await ensureTeamPlugin();

  const matches = normalizeMatchesShape(matchesRaw);

  const alignRows = alignClientRows?.length ? alignClientRows : clientRows;
  const existingIdKeyIndex = buildExistingClientIdKeyIndex(alignRows, matches);

  const alignStats = alignRows?.length
    ? alignUnmatchedToClientMatches(matches, alignRows)
    : { alignedById: 0, alignedByName: 0 };
  if (registerTeams && (alignStats.alignedById || alignStats.alignedByName)) {
    console.log(
      `[matchMerge] 未匹配对齐 client_matches · ID ${alignStats.alignedById} · 队名+时间 ${alignStats.alignedByName}`,
    );
  }

  const platformSideOverrides = db.isMatcherStoreReady()
    ? await db.fetchClientMatchPlatformOverrides()
    : {};

  let info = buildClientMatchList({
    matches,
    bets,
    timers,
    sourceFromBet,
    platformSideOverrides,
    existingClientRows: clientRows,
  });

  if (!db.isMatcherStoreReady()) {
    const { script } = db.getDbMode();
    throw new Error(
      `无法 matchMerge：数据库未配置（GAMEBET_DB_SCRIPT=${script}）。`
      + " 请配置 DATABASE_URL（或 DATABASE_URL_PUBLIC / DATABASE_URL_INTERNAL）。",
    );
  }
  const adapter = db.getClientMatchIdAdapter();
  info = await resolveClientMatchIds(adapter, info, { matches, existingIdKeyIndex });
  info = applyManualMatchLinks(info, matches, bets, timers, sourceFromBet, clientRows, platformSideOverrides, platformBindingsByClientId);
  info = filterMultiPlatformClientMatches(info);

  const pmSportByClientId = buildPmSportByClientId(clientRows);
  const endedFilter = filterActiveClientMatches(info, {
    platformMatches: matches,
    timersByProvider: timers,
    pmSportByClientId,
  });
  info = endedFilter.list;

  if (process.env.MATCHER_MERGE_DIAG === "1") {
    console.log(
      `[matchMerge:diag] matches=${info.length} ended=${endedFilter.endedCount}`
      + ` alignId=${alignStats.alignedById} alignName=${alignStats.alignedByName}`
      + ` hot=${JSON.stringify(hotCollector || {})}`,
    );
  }

  return {
    info,
    alignStats,
    endedCount: endedFilter.endedCount,
    hotCollector,
    teamReg,
    nameSync,
    clientRows,
    matches,
    bets,
    timers,
  };
}

/** 只读：跑完整 merge 流水线，不写 RDS / 不改采集内存 */
async function previewMatchMergeOnce() {
  return computeMatchMergeList({ registerTeams: false });
}

/**
 * 写库前用 match-projector 覆写主客（动态 import 避免与 projector→matcher 循环依赖）。
 */
async function applyProjectorSideEngine(info, {
  matches,
  bets,
  timers,
  clientRows,
} = {}) {
  const { reprojectMergedList } = await import(
    "../../match-projector/src/reproject_client_matches.js"
  );
  const platformOverrides = db.isMatcherStoreReady()
    ? await db.fetchClientMatchPlatformOverrides()
    : {};
  const forceReanchorOrientation
    = String(process.env.MATCH_PROJECTOR_REANCHOR || "").trim() === "1";
  const stickyOrientation
    = String(process.env.MATCH_PROJECTOR_STICKY_ORIENTATION || "").trim() === "1"
      ? true
      : undefined;
  return reprojectMergedList(info, {
    matches,
    bets,
    timers,
    existingClientRows: clientRows,
    platformOverrides,
    forceReanchorOrientation,
    stickyOrientation,
  });
}

/**
 * MATCHER_WRITER=composer：整段交给 match-composer（不再跑旧 merge/finalize）。
 * 写库；仍挡 projector WRITE 心跳（viaMatcherWriter 仅跳过本进程 matcher HB）。
 */
async function matchMergeOnceViaComposer() {
  const { composeOnce } = await import("../../match-composer/ops/compose_once.js");
  const result = await composeOnce({
    write: true,
    registerTeams: true,
    viaMatcherWriter: true,
  });
  const now = result.builtAt || Date.now();
  if (isEmbeddedMatcher())
    setClientMatchesFromMatchMerge(result.info, now);
  store.patchCollectorMatchClientIds(result.info);
  invalidateMatcherRdsSnapshot(["clientMatches"]);
  if (result.matchIdBackfill?.updated)
    invalidateMatcherRdsSnapshot(["platformMatches"]);
  if (result.endedCount > 0) {
    console.log(`[matchMerge] writer=composer 已结束移出活跃列表 ${result.endedCount} 场`);
  }
  console.log(
    `[matchMerge] writer=composer matches=${result.matchCount}`
    + ` locked=${result.projectStats?.locked}`
    + ` unlocked=${result.projectStats?.unlocked}`
    + ` alignId=${result.alignStats?.alignedById || 0}`
    + ` alignName=${result.alignStats?.alignedByName || 0}`,
  );
  return {
    matchCount: result.matchCount,
    builtAt: now,
    matchIdBackfill: result.matchIdBackfill,
    teamReg: result.teamReg,
    nameSync: result.nameSync,
    alignStats: result.alignStats || { alignedById: 0, alignedByName: 0 },
    hotCollector: null,
    sideEngine: "composer",
    projectStats: result.projectStats,
    writer: "composer",
    endedCount: result.endedCount || 0,
  };
}

async function matchMergeOnceImpl() {
  if (isComposerWriter())
    return matchMergeOnceViaComposer();

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
  } = await computeMatchMergeList({ registerTeams: true });

  if (endedCount > 0) {
    console.log(`[matchMerge] 已结束移出活跃列表 ${endedCount} 场`);
  }

  let projectStats = null;
  const sideEngine = isProjectorSideEngine() ? "projector" : "legacy";
  if (sideEngine === "projector") {
    try {
      projectStats = await applyProjectorSideEngine(info, {
        matches,
        bets,
        timers,
        clientRows,
      });
    }
    catch (err) {
      // fail-closed：投影失败不写库，避免半截 Sources 落库
      console.error("[matchMerge] sideEngine=projector failed, abort write:", err);
      throw err;
    }
    // 投影重建 Sources 后必须重跑 finalize 后置（Map0 只留 OB/PM 等）
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
    console.log(
      `[matchMerge] sideEngine=projector locked=${projectStats.locked}`
      + ` unlocked=${projectStats.unlocked} omits=${projectStats.omitEvents}`
      + ` reanchored=${projectStats.reanchored}`,
    );
  }

  const now = Date.now();
  const { clientMatchWriteRow } = await import(
    "../../match-projector/src/write_payload.js"
  );
  await db.writeClientMatchesAsync(
    info.map(m => clientMatchWriteRow(m, now)),
  );
  if (isEmbeddedMatcher())
    setClientMatchesFromMatchMerge(info, now);
  store.patchCollectorMatchClientIds(info);
  invalidateMatcherRdsSnapshot(["clientMatches"]);

  const matchIdBackfill = await backfillPlatformMatchIdsForIdMerges(info);
  if (matchIdBackfill?.updated)
    invalidateMatcherRdsSnapshot(["platformMatches"]);

  return {
    matchCount: info.length,
    builtAt: now,
    matchIdBackfill,
    teamReg,
    nameSync,
    alignStats,
    hotCollector,
    sideEngine,
    projectStats,
  };
}

/** 进程内互斥：matcher 循环与 UI 人工 matchMerge 共用同一 in-flight Promise */
async function matchMergeOnce(opts = {}) {
  if (_matchMergeInFlight) {
    if (opts.afterInFlight) {
      await _matchMergeInFlight;
      return matchMergeOnce();
    }
    return _matchMergeInFlight;
  }
  _matchMergeInFlight = matchMergeOnceImpl().finally(() => {
    _matchMergeInFlight = null;
  });
  return _matchMergeInFlight;
}

export {
  computeMatchMergeList,
  ensureTeamPlugin,
  invalidateTeamPlugin,
  matchMergeOnce,
  previewMatchMergeOnce,
  resetTeamPluginCache,
};
