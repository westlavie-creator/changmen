import "../lib/env.js";
import {
  buildClientMatchList,
  applyManualMatchLinks,
  filterMultiPlatformClientMatches,
  setTeamPlugin,
  normalizeMatchesShape,
  resolveClientMatchIds,
} from "../../../packages/match-engine/index.js";
import { formatOdds } from "../../../packages/shared/odds_format.js";
import * as db from "../../../packages/shared/db/index.js";
import {
  getClientMatchIdAdapter,
  isMatcherStoreReady,
} from "../../../packages/shared/db/matcher_store.js";
import { backfillPlatformMatchIdsForIdMerges } from "./backfill_platform_match_ids.js";
import { autoRegisterTeams } from "./auto_register_teams.js";
import { alignUnmatchedToClientMatches } from "./align_unmatched_to_client.js";

/**
 * 单次 rebuild：供 matcher 与人工关联 API 共用。
 */

let _pluginReady = null;

function resetTeamPluginCache() {
  _pluginReady = null;
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
      const { loadAndCreatePlugin } = await import("@changmen/team-resolver/supabase_db.js");
      const plugin = await loadAndCreatePlugin();
      setTeamPlugin(plugin);
    } catch (err) {
      console.warn("[rebuild] team-resolver 加载失败:", err.message);
    }
  })();
  return _pluginReady;
}

async function rebuildOnce() {
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

  if (!isMatcherStoreReady()) {
    const { script } = db.getDbMode();
    throw new Error(
      `无法 rebuild：数据库未配置（GAMEBET_DB_SCRIPT=${script}）。`
        + " 请配置 DATABASE_URL 或 SUPABASE_URL + SERVICE_KEY。",
    );
  }
  const adapter = getClientMatchIdAdapter();
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
    }))
  );

  const matchIdBackfill = await backfillPlatformMatchIdsForIdMerges(info);

  return { matchCount: info.length, builtAt: now, matchIdBackfill, teamReg, alignStats };
}

export { rebuildOnce, ensureTeamPlugin, resetTeamPluginCache };
