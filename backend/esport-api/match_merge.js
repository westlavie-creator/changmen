"use strict";

/**
 * Cross-platform match list for Client_GetMatchs.
 *
 * mergeMode:
 *   accumulate — each provider match is one row; Matchs has a single platform key (累加).
 *   merge        — reserved for true cross-platform merge (same event → one row, union Matchs).
 */

const MERGE_MODE = process.env.ESPORT_MATCH_MERGE_MODE || "accumulate";
const { resolveClientGame } = require("../shared/game_catalog");

/** A8 控制台展示用 betName（与 market_catalog OB 主盘一致） */
const OB_WIN_BET_RE =
  /(\[全场\].+获胜)|(\[地图\d+\].+获胜)|(.+全局.+获胜)|(.+单局.+获胜)/;
const RAY_WIN_GROUP = /^获胜者$/;

function stableId(seed) {
  let h = 0;
  for (const c of String(seed)) h = (Math.imul(31, h) + c.charCodeAt(0)) >>> 0;
  return h || 1;
}

function formatTitle(home, away) {
  const h = String(home || "").trim();
  const a = String(away || "").trim();
  if (h && a) return `${h} vs ${a}`;
  return h || a || "Unknown";
}

function betKey(provider, sourceMatchId) {
  return `${provider}:${sourceMatchId}`;
}

function winBetPriority(bet, provider) {
  const name = String(bet?.BetName ?? bet?.Name ?? "");
  const group = String(bet?.GroupName ?? bet?.group_name ?? "");
  if (provider === "RAY" && RAY_WIN_GROUP.test(group)) return 100;
  if (provider === "OB" && OB_WIN_BET_RE.test(name)) return 100;
  if (bet?.OddTypeID || bet?.odd_type_id) return 90;
  if (RAY_WIN_GROUP.test(group)) return 90;
  return 0;
}

/** 同一 Map 只保留一条主盘（防止 OB 子盘在 UI 上都被显示成「地图N 获胜」） */
function dedupeWinBetsByMap(bets, provider) {
  const byMap = new Map();
  for (const bet of bets) {
    const map = bet.Map ?? 0;
    const prev = byMap.get(map);
    if (!prev || winBetPriority(bet, provider) > winBetPriority(prev, provider)) {
      byMap.set(map, bet);
    }
  }
  return [...byMap.values()].sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
}

function buildBetRow(provider, sourceMatchId, clientMatchId, bet, sourceFromBet) {
  const map = bet.Map ?? 0;
  const rowSeed = `${provider}:${sourceMatchId}:${map}`;
  const betRowId = stableId(`bet:${rowSeed}`);
  const homeId = stableId(`home:${rowSeed}`);
  const awayId = stableId(`away:${rowSeed}`);

  return {
    ID: betRowId,
    MatchID: clientMatchId,
    Map: map,
    Name: bet.BetName || "",
    HomeID: homeId,
    HomeName: bet.HomeName || "",
    AwayID: awayId,
    AwayName: bet.AwayName || "",
    Status: bet.Status || "Normal",
    Sources: {
      [provider]: sourceFromBet(provider, bet),
    },
  };
}

function buildBetsForMatch(provider, sourceMatchId, clientMatchId, bets, sourceFromBet) {
  const stored = bets[betKey(provider, sourceMatchId)];
  if (!stored?.bets?.length) return [];
  // A8：GetMatchs 透传采集层已过滤的盘口，不在此二次用 OddTypeID/GroupName 剔除
  const winBets = dedupeWinBetsByMap(stored.bets, provider);
  return winBets.map((b) =>
    buildBetRow(provider, sourceMatchId, clientMatchId, b, sourceFromBet)
  );
}

function liveRound(timers, provider, sourceMatchId) {
  const block = timers?.[provider];
  const arr = block?.timer;
  if (!Array.isArray(arr)) return { round: 0, roundStart: 0 };
  const sid = String(sourceMatchId);
  const hit = arr.find((x) =>
    String(x.matchId ?? x.SourceMatchID ?? x.MatchID ?? "") === sid
  );
  if (!hit) return { round: 0, roundStart: 0 };
  return {
    round: Number(hit.round ?? hit.Round ?? hit.Map ?? hit.roundId ?? 0) || 0,
    roundStart: Number(hit.startTime ?? hit.StartTime ?? hit.RoundStart ?? 0) || 0,
  };
}

function buildAccumulateRow(provider, match, bets, timers, sourceFromBet) {
  const sourceMatchId = String(match.SourceMatchID);
  const clientMatchId = stableId(`match:${provider}:${sourceMatchId}`);
  const { round, roundStart } = liveRound(timers, provider, sourceMatchId);
  const sourceGameId = match.SourceGameID ?? match.GameID;
  const { Game, GameID } = resolveClientGame(provider, sourceGameId);

  return {
    ID: clientMatchId,
    Title: formatTitle(match.Home, match.Away),
    StartTime: Number(match.StartTime) || Date.now(),
    Game,
    GameID,
    Matchs: { [provider]: sourceMatchId },
    Bets: buildBetsForMatch(provider, sourceMatchId, clientMatchId, bets, sourceFromBet),
    Round: round,
    RoundStart: roundStart,
    Reverse: Array.isArray(match.Reverse) ? match.Reverse : [],
  };
}

/**
 * Accumulate mode: one Client_GetMatchs row per provider snapshot (no cross-platform pairing).
 */
function buildMatchListAccumulate(matches, bets, timers, sourceFromBet) {
  const list = [];
  for (const [provider, byId] of Object.entries(matches || {})) {
    if (!byId || typeof byId !== "object") continue;
    for (const match of Object.values(byId)) {
      if (!match?.SourceMatchID) continue;
      list.push(buildAccumulateRow(provider, match, bets, timers, sourceFromBet));
    }
  }
  list.sort((a, b) => a.StartTime - b.StartTime);
  return list;
}

/**
 * Placeholder for true merge: group rows by canonical event id and union Matchs / Bets Sources.
 */
function buildMatchListMerged(_matches, _bets, _timers, _sourceFromBet) {
  // TODO: pair OB/RAY/… by team names + start time or external mapping table.
  return buildMatchListAccumulate(_matches, _bets, _timers, _sourceFromBet);
}

function buildClientMatchList({ matches, bets, timers, sourceFromBet }) {
  if (MERGE_MODE === "merge") {
    return buildMatchListMerged(matches, bets, timers, sourceFromBet);
  }
  return buildMatchListAccumulate(matches, bets, timers, sourceFromBet);
}

module.exports = {
  MERGE_MODE,
  buildClientMatchList,
  buildMatchListAccumulate,
  buildMatchListMerged,
  stableId,
};
