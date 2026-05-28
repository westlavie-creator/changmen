"use strict";

/**
 * Cross-platform match list for Client_GetMatchs.
 *
 * mergeMode:
 *   accumulate — each provider match is one row; Matchs has a single platform key (累加).
 *   merge        — reserved for true cross-platform merge (same event → one row, union Matchs).
 */

const MERGE_MODE = process.env.ESPORT_MATCH_MERGE_MODE || "accumulate";
const {
  resolveClientGame,
  describePlatformGame,
  getGameCodeForPlatformId,
  getPlatformGameId,
} = require("../shared/game_catalog");
const { obSavedBetIsMatchWinner, matchesSavedBet } = require("../shared/market_catalog");
const {
  resolveImMap,
  pickStr,
  imBetNameIsCollectible,
  normalizeImBet,
} = require("../shared/im_parse.js");

const {
  IM_ODDS_ACTIVE_MS,
  A8_MATCH_MAX_FUTURE_MS,
  normalizeEpochMs,
  a8StartTimeListAllowed,
} = require("../shared/a8_match_time.js");
const IM_ENRICH_WINDOW_MS = 3 * 60 * 60 * 1000;

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

function winBetPriority(bet, provider, gameCode) {
  const name = String(bet?.BetName ?? bet?.Name ?? "");
  const group = String(bet?.GroupName ?? bet?.group_name ?? "");
  if (name.includes("+")) return 0;
  if (provider === "OB" && gameCode && obSavedBetIsMatchWinner(bet, gameCode)) {
    return 200;
  }
  if (provider === "RAY" && RAY_WIN_GROUP.test(group)) return 100;
  if (provider === "OB" && OB_WIN_BET_RE.test(name)) return 100;
  if (bet?.OddTypeID || bet?.odd_type_id) return 90;
  if (RAY_WIN_GROUP.test(group)) return 90;
  return 0;
}

/** 同一 Map 只保留一条主盘（防止 OB 子盘在 UI 上都被显示成「地图N 获胜」） */
function dedupeWinBetsByMap(bets, provider, gameCode) {
  const byMap = new Map();
  for (const bet of bets) {
    const map = bet.Map ?? 0;
    const prev = byMap.get(map);
    if (
      !prev ||
      winBetPriority(bet, provider, gameCode) > winBetPriority(prev, provider, gameCode)
    ) {
      byMap.set(map, bet);
    }
  }
  return [...byMap.values()].sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
}

function normalizeImStoredBet(bet) {
  return normalizeImBet(bet);
}

function isPlaceholderTeamName(name) {
  const t = String(name || "").trim();
  return !t || t === "主队" || t === "客队" || t === "Unknown";
}

function buildTeamEnrichIndex(matches) {
  const rows = [];
  for (const [provider, byId] of Object.entries(matches || {})) {
    if (provider === "IM" || !byId || typeof byId !== "object") continue;
    for (const m of Object.values(byId)) {
      if (!m?.SourceMatchID) continue;
      if (isPlaceholderTeamName(m.Home) || isPlaceholderTeamName(m.Away)) continue;
      const teams = Array.isArray(m.Teams) ? m.Teams : [];
      const nativeGameId = String(m.SourceGameID || "").trim();
      const gameCode = getGameCodeForPlatformId(provider, nativeGameId);
      const imSourceGameId = gameCode ? getPlatformGameId("IM", gameCode) : "";
      rows.push({
        start: normalizeEpochMs(m.StartTime),
        home: String(m.Home).trim(),
        away: String(m.Away).trim(),
        homeId: m.HomeID,
        awayId: m.AwayID,
        homeLogo: teams[0]?.Logo || "",
        awayLogo: teams[1]?.Logo || "",
        sourceGameId: nativeGameId,
        imSourceGameId: imSourceGameId || "",
        teams: m.Teams,
      });
    }
  }
  return rows;
}

function enrichImMatch(match, teamIndex) {
  const needTeams =
    isPlaceholderTeamName(match.Home) || isPlaceholderTeamName(match.Away);
  const needGame =
    !match.SourceGameID || String(match.SourceGameID).trim() === "unknown";
  if (!needTeams && !needGame) return match;

  const st = normalizeEpochMs(match.StartTime);
  const homeKey = String(match.Home || "").trim().toLowerCase();
  const awayKey = String(match.Away || "").trim().toLowerCase();
  let best = null;
  if (
    homeKey &&
    awayKey &&
    !isPlaceholderTeamName(match.Home) &&
    !isPlaceholderTeamName(match.Away)
  ) {
    for (const row of teamIndex) {
      const rh = row.home.toLowerCase();
      const ra = row.away.toLowerCase();
      if ((rh === homeKey && ra === awayKey) || (rh === awayKey && ra === homeKey)) {
        best = row;
        break;
      }
    }
  }
  if (!best) {
    let bestGap = IM_ENRICH_WINDOW_MS + 1;
    for (const row of teamIndex) {
      if (!st || !row.start) continue;
      const gap = Math.abs(row.start - st);
      if (gap < bestGap) {
        bestGap = gap;
        best = row;
      }
    }
    if (!best || bestGap > IM_ENRICH_WINDOW_MS) return match;
  }
  const homeId = String(match.HomeID || "");
  const awayId = String(match.AwayID || "");
  const home = needTeams && isPlaceholderTeamName(match.Home) ? best.home : match.Home;
  const away = needTeams && isPlaceholderTeamName(match.Away) ? best.away : match.Away;
  const sourceGameId =
    needGame && best.imSourceGameId
      ? best.imSourceGameId
      : match.SourceGameID;
  const teams =
    match.Teams?.length && !needTeams
      ? match.Teams
      : [
          {
            Type: "IM",
            GameID: sourceGameId,
            Name: home,
            TeamID: homeId.includes("-home") ? best.homeId : match.HomeID,
            Logo: best.homeLogo || "",
          },
          {
            Type: "IM",
            GameID: sourceGameId,
            Name: away,
            TeamID: awayId.includes("-away") ? best.awayId : match.AwayID,
            Logo: best.awayLogo || "",
          },
        ];
  return {
    ...match,
    Home: home,
    Away: away,
    SourceGameID: sourceGameId,
    StartTime: st || normalizeEpochMs(best.start) || match.StartTime,
    HomeID: homeId.includes("-home") ? best.homeId : match.HomeID,
    AwayID: awayId.includes("-away") ? best.awayId : match.AwayID,
    Teams: teams,
  };
}

function filterImStoredWinBets(bets) {
  return (bets || []).filter((bet) => {
    const name = pickStr(bet, "BetName", "Name", "name", "betName");
    if (name && !imBetNameIsCollectible(name)) return false;
    return matchesSavedBet("IM", bet, { gameCode: null });
  });
}

function dedupeImBetsByMap(bets) {
  const byMap = new Map();
  for (const bet of bets) {
    const row = normalizeImStoredBet(bet);
    const map = row.Map ?? 0;
    const prev = byMap.get(map);
    if (!prev) {
      byMap.set(map, row);
      continue;
    }
    const prevId = String(prev.SourceBetID || "");
    const nextId = String(row.SourceBetID || "");
    if (nextId > prevId) byMap.set(map, row);
  }
  return [...byMap.values()].sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
}

function imMatchIsStale(match, betsBlock) {
  const start = normalizeEpochMs(match.StartTime);
  if (start > 0 && !a8StartTimeListAllowed(start)) return true;
  const savedAt = Number(betsBlock?.savedAt || match.savedAt) || 0;
  if (savedAt > 0 && Date.now() - savedAt > IM_ODDS_ACTIVE_MS) return true;
  if (start > 0 && start > Date.now() + A8_MATCH_MAX_FUTURE_MS) return true;
  return false;
}

function buildBetRow(provider, sourceMatchId, clientMatchId, bet, sourceFromBet, matchTeams) {
  const row = provider === "IM" ? normalizeImStoredBet(bet) : bet;
  const map = row.Map ?? 0;
  const rowSeed = `${provider}:${sourceMatchId}:${map}`;
  const betRowId = stableId(`bet:${rowSeed}`);
  const homeId = stableId(`home:${rowSeed}`);
  const awayId = stableId(`away:${rowSeed}`);
  const matchHome = matchTeams?.home || "";
  const matchAway = matchTeams?.away || "";
  const pickTeamName = (betName, fromMatch) => {
    if (fromMatch && !isPlaceholderTeamName(fromMatch)) return fromMatch;
    if (betName && !isPlaceholderTeamName(betName)) return betName;
    return fromMatch || betName || "";
  };

  return {
    ID: betRowId,
    MatchID: clientMatchId,
    Map: map,
    Name: row.BetName || "",
    HomeID: homeId,
    HomeName:
      provider === "IM" ? pickTeamName(row.HomeName, matchHome) : row.HomeName || "",
    AwayID: awayId,
    AwayName:
      provider === "IM" ? pickTeamName(row.AwayName, matchAway) : row.AwayName || "",
    Status: row.Status || "Normal",
    Sources: {
      [provider]: sourceFromBet(provider, row),
    },
  };
}

function filterStoredWinBets(bets, provider, gameCode) {
  return (bets || []).filter((bet) => {
    if (provider === "OB") {
      const name = String(bet?.BetName ?? "");
      if (name.includes("+")) return false;
      if (gameCode && matchesSavedBet("OB", bet, { gameCode })) return true;
      return OB_WIN_BET_RE.test(name);
    }
    if (provider === "RAY") {
      return matchesSavedBet("RAY", bet, { gameCode });
    }
    if (provider === "IM") {
      const name = pickStr(bet, "BetName", "Name", "name", "betName");
      if (name && !imBetNameIsCollectible(name)) return false;
      return matchesSavedBet("IM", bet, { gameCode });
    }
    return true;
  });
}

function buildBetsForMatch(
  provider,
  sourceMatchId,
  clientMatchId,
  bets,
  sourceFromBet,
  gameCode,
  matchTeams,
) {
  const stored = bets[betKey(provider, sourceMatchId)];
  if (!stored?.bets?.length) return [];
  let winBets;
  if (provider === "IM") {
    winBets = dedupeImBetsByMap(filterImStoredWinBets(stored.bets));
  } else {
    winBets = dedupeWinBetsByMap(
      filterStoredWinBets(stored.bets, provider, gameCode),
      provider,
      gameCode,
    );
  }
  return winBets.map((b) =>
    buildBetRow(provider, sourceMatchId, clientMatchId, b, sourceFromBet, matchTeams),
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

function collapseImClientRows(list) {
  const imRows = [];
  const other = [];
  for (const row of list) {
    if (row.Matchs?.IM) imRows.push(row);
    else other.push(row);
  }
  const byKey = new Map();
  for (const row of imRows) {
    const title = String(row.Title || "").trim().toLowerCase();
    const placeholder = title.includes("主队") || title.includes("客队");
    const key = placeholder
      ? `ph:${row.GameID}`
      : `${title}|${row.GameID}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    const pick =
      row.Bets.length > prev.Bets.length ||
      (row.Bets.length === prev.Bets.length && row.StartTime > prev.StartTime)
        ? row
        : prev;
    const drop = pick === row ? prev : row;
    byKey.set(key, pick);
    void drop;
  }
  return [...other, ...byKey.values()].sort((a, b) => a.StartTime - b.StartTime);
}

function buildAccumulateRow(provider, match, bets, timers, sourceFromBet) {
  const sourceMatchId = String(match.SourceMatchID);
  const clientMatchId = stableId(`match:${provider}:${sourceMatchId}`);
  const { round, roundStart } = liveRound(timers, provider, sourceMatchId);
  const sourceGameId = match.SourceGameID ?? match.GameID;
  const { Game, GameID } = resolveClientGame(provider, sourceGameId);
  const gameCode = describePlatformGame(provider, sourceGameId).gameCode;
  const matchTeams =
    provider === "IM"
      ? { home: String(match.Home || "").trim(), away: String(match.Away || "").trim() }
      : undefined;

  return {
    ID: clientMatchId,
    Title: formatTitle(match.Home, match.Away),
    StartTime: normalizeEpochMs(match.StartTime),
    Game,
    GameID,
    BO: Number(match.BO) || 0,
    Matchs: { [provider]: sourceMatchId },
    Bets: buildBetsForMatch(
      provider,
      sourceMatchId,
      clientMatchId,
      bets,
      sourceFromBet,
      gameCode,
      matchTeams,
    ),
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
        const unknownGame =
          !enriched.SourceGameID || String(enriched.SourceGameID).trim() === "unknown";
        if (
          isPlaceholderTeamName(enriched.Home) &&
          isPlaceholderTeamName(enriched.Away) &&
          unknownGame
        ) {
          continue;
        }
        list.push(buildAccumulateRow(provider, enriched, bets, timers, sourceFromBet));
        continue;
      }
      list.push(buildAccumulateRow(provider, match, bets, timers, sourceFromBet));
    }
  }
  list.sort((a, b) => a.StartTime - b.StartTime);
  return collapseImClientRows(list);
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
