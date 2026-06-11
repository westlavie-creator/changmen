"use strict";

/**
 * 单次 rebuild：供 matcher 与人工关联 API 共用。
 */

require("../lib/env");

const {
  buildClientMatchList,
  applyManualMatchLinks,
  filterMultiPlatformClientMatches,
  setTeamPlugin,
  normalizeMatchesShape,
  resolveClientMatchIds,
} = require("../engine");
const { formatOdds } = require("../../shared/odds_format");
const sb = require("../../shared/db/supabase");
const { backfillPlatformMatchIdsForIdMerges } = require("./backfill_platform_match_ids");
const { autoRegisterTeams } = require("./auto_register_teams");
const { alignUnmatchedToClientMatches } = require("./align_unmatched_to_client");

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
      const { loadAndCreatePlugin } = require("../../team-resolver/supabase_db");
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
  await sb.initLastWrittenIds();

  const [matchesRaw, bets, timers, clientRows] = await Promise.all([
    sb.fetchPlatformMatches(),
    sb.fetchPlatformBets(),
    sb.fetchLiveTimers(),
    sb.fetchClientMatches(),
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

  const client = sb.getServiceClient();
  if (!client) throw new Error("Supabase 未配置，无法 rebuild");
  info = await resolveClientMatchIds(client, info, { matches });
  info = applyManualMatchLinks(info, matches, bets, timers, sourceFromBet, clientRows);
  info = filterMultiPlatformClientMatches(info);

  const now = Date.now();
  await sb.writeClientMatchesAsync(
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

  const matchIdBackfill = await backfillPlatformMatchIdsForIdMerges(client, info);

  return { matchCount: info.length, builtAt: now, matchIdBackfill, teamReg, alignStats };
}

module.exports = { rebuildOnce, ensureTeamPlugin, resetTeamPluginCache };
