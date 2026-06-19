import "../lib/env.js";
import {
  buildClientMatchList,
  applyManualMatchLinks,
  filterMultiPlatformClientMatches,
  setTeamPlugin,
  normalizeMatchesShape,
  resolveClientMatchIds,
  isClientMatchEnded,
} from "@changmen/match-engine";
import { formatOdds } from "@changmen/shared/odds_format.js";
import * as db from "@changmen/db";
import { CLIENT_MATCH_LIST_DEFAULT, CLIENT_MATCH_LIST_HIDDEN } from "@changmen/db";
import { backfillPlatformMatchIdsForIdMerges } from "./backfill_platform_match_ids.js";
import { autoRegisterTeams } from "./auto_register_teams.js";
import { alignUnmatchedToClientMatches } from "./align_unmatched_to_client.js";

/**
 * 单次 rebuild：供 matcher 与人工关联 API 共用。
 */

let _pluginReady = null;
let _rebuildInFlight = null;

function resetTeamPluginCache() {
  _pluginReady = null;
}

/** 队伍映射 / canonical 写入后调用，使下次 rebuild 重载 team-resolver */
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
  if (_pluginReady) return _pluginReady;
  _pluginReady = (async () => {
    try {
      const { loadAndCreatePlugin } = await import("@changmen/team-resolver/team_db.js");
      const plugin = await loadAndCreatePlugin();
      setTeamPlugin(plugin);
    } catch (err) {
      console.warn("[rebuild] team-resolver 加载失败:", err.message);
    }
  })();
  return _pluginReady;
}

async function rebuildOnceImpl() {
  await ensureTeamPlugin();
  await db.initLastWrittenIds();

  const [matchesRaw, bets, timers, clientRows] = await Promise.all([
    db.fetchPlatformMatches(),
    db.fetchPlatformBets(),
    db.fetchLiveTimers(),
    db.fetchClientMatches(),
  ]);

  const teamReg = await autoRegisterTeams(matchesRaw);
  if (teamReg.registered > 0) {
    resetTeamPluginCache();
    await ensureTeamPlugin();
  }

  const matches = normalizeMatchesShape(matchesRaw);

  const alignStats = clientRows?.length
    ? alignUnmatchedToClientMatches(matches, clientRows)
    : { alignedById: 0, alignedByName: 0 };
  if (alignStats.alignedById || alignStats.alignedByName) {
    console.log(
      `[rebuild] 未匹配对齐 client_matches · ID ${alignStats.alignedById} · 队名+时间 ${alignStats.alignedByName}`,
    );
  }

  let info = buildClientMatchList({ matches, bets, timers, sourceFromBet });

  if (!db.isMatcherStoreReady()) {
    const { script } = db.getDbMode();
    throw new Error(
      `无法 rebuild：数据库未配置（GAMEBET_DB_SCRIPT=${script}）。`
        + " 请配置 DATABASE_URL（或 DATABASE_URL_PUBLIC / DATABASE_URL_INTERNAL）。",
    );
  }
  const adapter = db.getClientMatchIdAdapter();
  info = await resolveClientMatchIds(adapter, info, { matches });
  info = applyManualMatchLinks(info, matches, bets, timers, sourceFromBet, clientRows);
  info = filterMultiPlatformClientMatches(info);

  const now = Date.now();
  await db.writeClientMatchesAsync(
    info.map((m) => ({
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
      built_at: now,
      list_status: isClientMatchEnded(m, matches, timers, now)
        ? CLIENT_MATCH_LIST_HIDDEN
        : CLIENT_MATCH_LIST_DEFAULT,
    }))
  );

  const matchIdBackfill = await backfillPlatformMatchIdsForIdMerges(info);

  return { matchCount: info.length, builtAt: now, matchIdBackfill, teamReg, alignStats };
}

/** 进程内互斥：matcher 循环与 UI 人工 rebuild 共用同一 in-flight Promise */
async function rebuildOnce() {
  if (_rebuildInFlight) return _rebuildInFlight;
  _rebuildInFlight = rebuildOnceImpl().finally(() => {
    _rebuildInFlight = null;
  });
  return _rebuildInFlight;
}

export { rebuildOnce, ensureTeamPlugin, resetTeamPluginCache, invalidateTeamPlugin };
