"use strict";

/**
 * 跨平台赛事列表构建（Client_GetMatchs）。
 *
 * 子模块：
 *   match_utils  — stableId / formatTitle / betKey / isPlaceholderTeamName
 *   team_key     — normalizeTeam / canonicalMatchKey / setTeamPlugin
 *   im_enrich    — IM 队名补全 / 赔率处理 / collapseImClientRows
 *   bet_builder  — 通用赔率过滤 + 构建
 */

const MERGE_MODE = "merge";

const { stableId, formatTitle, betKey } = require("./match_utils");
const { normalizeTeam, canonicalMatchKey, setTeamPlugin } = require("./team_key");
const {
  buildTeamEnrichIndex, enrichImMatch, imMatchIsStale, collapseImClientRows,
} = require("./im_enrich");
const { buildBetsForMatch } = require("./bet_builder");

const { resolveClientGame, describePlatformGame, getGameCodeForPlatformId } = require("../shared/game_catalog");
const { normalizeEpochMs, a8StartTimeListAllowed } = require("../integrations/a8/match_time.js");

/** 平台优先级：决定合并行取哪个平台的 Title/Game 作为规范值 */
const PROVIDER_PRIORITY = { OB: 10, RAY: 9, TF: 8, IA: 7, IMT: 6, IM: 5, PB: 4, SABA: 3, HG: 2 };

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function liveRound(timers, provider, sourceMatchId) {
  const block = timers?.[provider];
  const arr = block?.timer;
  if (!Array.isArray(arr)) return { round: 0, roundStart: 0 };
  const sid = String(sourceMatchId);
  const hit = arr.find((x) => String(x.matchId ?? x.SourceMatchID ?? x.MatchID ?? "") === sid);
  if (!hit) return { round: 0, roundStart: 0 };
  return {
    round: Number(hit.round ?? hit.Round ?? hit.Map ?? hit.roundId ?? 0) || 0,
    roundStart: Number(hit.startTime ?? hit.StartTime ?? hit.RoundStart ?? 0) || 0,
  };
}

// ── 单平台行构建 ──────────────────────────────────────────────────────────────

function buildAccumulateRow(provider, match, bets, timers, sourceFromBet) {
  const sourceMatchId = String(match.SourceMatchID);
  const clientMatchId = stableId(`match:${provider}:${sourceMatchId}`);
  const { round, roundStart } = liveRound(timers, provider, sourceMatchId);
  const sourceGameId = match.SourceGameID ?? match.GameID;
  const { Game, GameID } = resolveClientGame(provider, sourceGameId);
  const gameCode = describePlatformGame(provider, sourceGameId).gameCode;
  const matchTeams = provider === "IM"
    ? { home: String(match.Home || "").trim(), away: String(match.Away || "").trim() }
    : undefined;
  return {
    ID: clientMatchId,
    Title: formatTitle(match.Home, match.Away),
    StartTime: normalizeEpochMs(match.StartTime),
    Game, GameID,
    BO: Number(match.BO) || 0,
    Matchs: { [provider]: sourceMatchId },
    Bets: buildBetsForMatch(provider, sourceMatchId, clientMatchId, bets, sourceFromBet, gameCode, matchTeams),
    Round: round,
    RoundStart: roundStart,
    Reverse: Array.isArray(match.Reverse) ? match.Reverse : [],
  };
}

// ── 合并逻辑 ──────────────────────────────────────────────────────────────────

function mergeGroupWithKey(group, canonicalKey) {
  group.sort((a, b) => (PROVIDER_PRIORITY[b.row._provider] || 0) - (PROVIDER_PRIORITY[a.row._provider] || 0));
  const canonical = group[0].row;
  const mergedMatchs = {};
  for (const { row } of group) Object.assign(mergedMatchs, row.Matchs);

  const byMap = new Map();
  for (const { row, reversed } of group) {
    for (const bet of row.Bets) {
      const map = bet.Map ?? 0;
      if (!byMap.has(map)) byMap.set(map, { canonBet: bet, sources: {} });
      const entry = byMap.get(map);
      for (const [p, src] of Object.entries(bet.Sources)) {
        entry.sources[p] = reversed
          ? { ...src, HomeID: src.AwayID, AwayID: src.HomeID, HomeOdds: src.AwayOdds, AwayOdds: src.HomeOdds }
          : { ...src };
      }
    }
  }

  const mergedBets = [...byMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([map, { canonBet, sources }]) => ({
      ...canonBet,
      ID: stableId(`bet:${canonicalKey}:${map}`),
      MatchID: canonicalKey,
      Sources: sources,
    }));

  return {
    ID: canonicalKey,
    Title: canonical.Title,
    StartTime: canonical.StartTime,
    Game: canonical.Game,
    GameID: canonical.GameID,
    BO: canonical.BO,
    Matchs: mergedMatchs,
    Bets: mergedBets,
    Round: canonical.Round,
    RoundStart: canonical.RoundStart,
    Reverse: group.filter((g) => g.reversed).flatMap((g) => Object.keys(g.row.Matchs)),
  };
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

function buildMatchListMerged(matches, bets, timers, sourceFromBet) {
  const teamIndex = buildTeamEnrichIndex(matches);
  const keyGroups = new Map();

  for (const [provider, byId] of Object.entries(matches || {})) {
    if (!byId || typeof byId !== "object") continue;
    for (const match of Object.values(byId)) {
      if (!match?.SourceMatchID) continue;
      const startMs = normalizeEpochMs(match.StartTime);
      if (startMs > 0 && !a8StartTimeListAllowed(startMs)) continue;

      let m = match;
      if (provider === "IM") {
        const block = bets[betKey("IM", match.SourceMatchID)];
        if (imMatchIsStale(match, block)) continue;
        m = enrichImMatch(match, teamIndex);
        const unknownGame = !m.SourceGameID || String(m.SourceGameID).trim() === "unknown";
        if (!m.Home && !m.Away && unknownGame) continue;
      }

      const row = buildAccumulateRow(provider, m, bets, timers, sourceFromBet);
      row._provider = provider;

      const nativeGameId = String(m.SourceGameID || m.GameID || "");
      const gameCode = getGameCodeForPlatformId(provider, nativeGameId);
      const ck = canonicalMatchKey(
        row.GameID, String(m.Home || ""), String(m.Away || ""), gameCode,
        { provider, homeId: String(m.HomeID || ""), awayId: String(m.AwayID || "") }
      );
      const mapKey = ck ? ck.key : row.ID;
      const reversed = ck ? ck.reversed : false;

      if (!keyGroups.has(mapKey)) keyGroups.set(mapKey, []);
      const bucket = keyGroups.get(mapKey);
      const existIdx = bucket.findIndex((e) => e.row._provider === provider);
      if (existIdx >= 0) {
        if (row.StartTime > bucket[existIdx].row.StartTime) bucket[existIdx] = { row, reversed };
      } else {
        bucket.push({ row, reversed });
      }
    }
  }

  const result = [];
  for (const [key, group] of keyGroups) {
    let out;
    if (group.length === 1) {
      out = group[0].row;
      out.ID = key;
      out.Bets = out.Bets.map((b) => ({
        ...b,
        ID: stableId(`bet:${key}:${b.Map ?? 0}`),
        MatchID: key,
      }));
    } else {
      out = mergeGroupWithKey(group, key);
    }
    delete out._provider;
    result.push(out);
  }

  result.sort((a, b) => a.StartTime - b.StartTime);
  return collapseImClientRows(result);
}

function buildMatchListAccumulate(matches, bets, timers, sourceFromBet) {
  const list = [];
  const teamIndex = buildTeamEnrichIndex(matches);
  for (const [provider, byId] of Object.entries(matches || {})) {
    if (!byId || typeof byId !== "object") continue;
    for (const match of Object.values(byId)) {
      if (!match?.SourceMatchID) continue;
      const startMs = normalizeEpochMs(match.StartTime);
      if (startMs > 0 && !a8StartTimeListAllowed(startMs)) continue;
      if (provider === "IM") {
        const block = bets[betKey("IM", match.SourceMatchID)];
        if (imMatchIsStale(match, block)) continue;
        const enriched = enrichImMatch(match, teamIndex);
        const unknownGame = !enriched.SourceGameID || String(enriched.SourceGameID).trim() === "unknown";
        if (!enriched.Home && !enriched.Away && unknownGame) continue;
        list.push(buildAccumulateRow(provider, enriched, bets, timers, sourceFromBet));
        continue;
      }
      list.push(buildAccumulateRow(provider, match, bets, timers, sourceFromBet));
    }
  }
  list.sort((a, b) => a.StartTime - b.StartTime);
  return collapseImClientRows(list);
}

function buildClientMatchList({ matches, bets, timers, sourceFromBet }) {
  return buildMatchListMerged(matches, bets, timers, sourceFromBet);
}

module.exports = {
  MERGE_MODE,
  buildClientMatchList,
  buildMatchListAccumulate,
  buildMatchListMerged,
  stableId,
  normalizeTeam,
  canonicalMatchKey,
  setTeamPlugin,
};
