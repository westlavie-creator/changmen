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
  invalidateMatcherRdsSnapshot,
} from "./rds_snapshot_cache.js";
import {
  applyPairingMetadata,
  syncPlatformBindingsForRows,
} from "./pairing_metadata.js";
import "../lib/env.js";

/**
 * 单次 matchMerge：读 platform 快照 → 跨平台合并 → 写 client_matches。
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

async function matchMergeOnceImpl() {
  await db.initLastWrittenIds();

  const { matchesRaw, bets, timers, clientRows, alignClientRows, hotCollector } = await fetchMatcherRdsSnapshot();

  const teamReg = await autoRegisterTeams(matchesRaw);
  const nameSync = await db.syncCanonicalTeamNamesFromOb();
  const teamDataChanged = (teamReg?.registered > 0) || (nameSync?.updated > 0);
  if (teamDataChanged)
    resetTeamPluginCache();
  await ensureTeamPlugin();

  const matches = normalizeMatchesShape(matchesRaw);

  const alignRows = alignClientRows?.length ? alignClientRows : clientRows;
  const existingIdKeyIndex = buildExistingClientIdKeyIndex(alignRows, matches);

  const alignStats = alignRows?.length
    ? alignUnmatchedToClientMatches(matches, alignRows)
    : { alignedById: 0, alignedByName: 0 };
  if (alignStats.alignedById || alignStats.alignedByName || alignStats.alignedByObSlot) {
    console.log(
      `[matchMerge] 未匹配对齐 client_matches · ID ${alignStats.alignedById}`
      + ` · 队名+时间 ${alignStats.alignedByName}`
      + ` · OB 槽位 ${alignStats.alignedByObSlot ?? 0}`,
    );
  }

  const platformSideOverrides = db.isMatcherStoreReady()
    ? await db.fetchClientMatchPlatformOverrides()
    : {};

  let info = buildClientMatchList({ matches, bets, timers, sourceFromBet, platformSideOverrides });

  if (!db.isMatcherStoreReady()) {
    const { script } = db.getDbMode();
    throw new Error(
      `无法 matchMerge：数据库未配置（GAMEBET_DB_SCRIPT=${script}）。`
      + " 请配置 DATABASE_URL（或 DATABASE_URL_PUBLIC / DATABASE_URL_INTERNAL）。",
    );
  }
  const adapter = db.getClientMatchIdAdapter();
  info = await resolveClientMatchIds(adapter, info, { matches, existingIdKeyIndex });
  info = applyManualMatchLinks(info, matches, bets, timers, sourceFromBet, clientRows, platformSideOverrides);
  info = filterMultiPlatformClientMatches(info);

  const pmSportByClientId = buildPmSportByClientId(clientRows);
  const endedFilter = filterActiveClientMatches(info, {
    platformMatches: matches,
    timersByProvider: timers,
    pmSportByClientId,
  });
  info = endedFilter.list;
  if (endedFilter.endedCount > 0) {
    console.log(`[matchMerge] 已结束移出活跃列表 ${endedFilter.endedCount} 场`);
  }

  const {
    annotated: pairingAnnotated,
    published: pairingPublished,
  } = applyPairingMetadata(info, matches);
  if (pairingPublished.length !== info.length) {
    console.log(
      `[matchMerge] pairing 发布过滤 ${info.length} → ${pairingPublished.length}`
      + `（tier=${process.env.MATCHER_PUBLISH_TIER || "default"}`
      + ` provisional=${process.env.MATCHER_PUBLISH_PROVISIONAL ?? "1"}）`,
    );
  }
  info = pairingPublished;

  const now = Date.now();
  await db.writeClientMatchesAsync(
    info.map(m => ({
      id: Number(m.ID),
      merge_key: m.MergeKey ? String(m.MergeKey) : null,
      title: String(m.Title || ""),
      game: String(m.Game || ""),
      game_id: String(m.GameID || ""),
      start_time: Number(m.StartTime) || 0,
      bo: Number(m.BO) || 0,
      round: Number(m.Round) || 0,
      round_start: Number(m.RoundStart) || 0,
      reverse: Array.isArray(m.Reverse) ? m.Reverse : [],
      matchs: m.Matchs || {},
      bets: m.Bets || [],
      home_gb_team_id: m.HomeGbTeamId ?? null,
      away_gb_team_id: m.AwayGbTeamId ?? null,
      pairing_tier: m.PairingTier ?? null,
      pairing_confidence: m.PairingConfidence ?? null,
      event_anchor: m.EventAnchor ?? null,
      built_at: now,
    })),
  );
  if (isEmbeddedMatcher())
    setClientMatchesFromMatchMerge(info, now);
  store.patchCollectorMatchClientIds(info);
  invalidateMatcherRdsSnapshot(["clientMatches"]);

  const matchIdBackfill = await backfillPlatformMatchIdsForIdMerges(info);
  if (matchIdBackfill?.updated)
    invalidateMatcherRdsSnapshot(["platformMatches"]);

  const bindingSync = await syncPlatformBindingsForRows(pairingAnnotated, matches);
  if (bindingSync?.updated > 0) {
    console.log(`[matchMerge] platform 绑定元数据 ${bindingSync.updated} 条`);
    invalidateMatcherRdsSnapshot(["platformMatches"]);
  }

  return {
    matchCount: info.length,
    builtAt: now,
    matchIdBackfill,
    bindingSync,
    teamReg,
    nameSync,
    alignStats,
    hotCollector,
    pairing: {
      annotated: pairingAnnotated.length,
      published: pairingPublished.length,
    },
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

export { ensureTeamPlugin, invalidateTeamPlugin, matchMergeOnce, resetTeamPluginCache };
