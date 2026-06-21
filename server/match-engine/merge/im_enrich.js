/**
 * IM 平台专属处理：
 *   - 队名/游戏补全（IM 有时上报占位符队名）
 *   - IM 赔率过滤与去重
 *   - collapseImClientRows（合并结果里的 IM 重复行）
 */

import { getGameCodeForPlatformId, getPlatformGameId } from "@changmen/shared/catalog/game_catalog";
import { matchesSavedBet } from "@changmen/shared/catalog/market_catalog";
import { imBetNameIsCollectible, normalizeImBet, pickStr } from "@changmen/shared/im_parse";
import {
  A8_MATCH_MAX_FUTURE_MS,
  a8StartTimeListAllowed,
  IM_ODDS_ACTIVE_MS,
  normalizeEpochMs,
} from "@changmen/shared/time/match_time";
import { isPlaceholderTeamName } from "../teams/match_utils.js";

const IM_ENRICH_WINDOW_MS = 3 * 60 * 60 * 1000;

// ── 队名/游戏补全 ─────────────────────────────────────────────────────────────

/**
 * 从非 IM 平台的比赛数据里建立索引，用于给 IM 占位符队名补全。
 */
function buildTeamEnrichIndex(matches) {
  const rows = [];
  for (const [provider, byId] of Object.entries(matches || {})) {
    if (provider === "IM" || !byId || typeof byId !== "object")
      continue;
    for (const m of Object.values(byId)) {
      if (!m?.SourceMatchID)
        continue;
      if (isPlaceholderTeamName(m.Home) || isPlaceholderTeamName(m.Away))
        continue;
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
  const needTeams
    = isPlaceholderTeamName(match.Home) || isPlaceholderTeamName(match.Away);
  const needGame
    = !match.SourceGameID || String(match.SourceGameID).trim() === "unknown";
  if (!needTeams && !needGame)
    return match;

  const st = normalizeEpochMs(match.StartTime);
  const homeKey = String(match.Home || "").trim().toLowerCase();
  const awayKey = String(match.Away || "").trim().toLowerCase();
  let best = null;

  if (homeKey && awayKey && !isPlaceholderTeamName(match.Home) && !isPlaceholderTeamName(match.Away)) {
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
      if (!st || !row.start)
        continue;
      const gap = Math.abs(row.start - st);
      if (gap < bestGap) { bestGap = gap; best = row; }
    }
    if (!best || bestGap > IM_ENRICH_WINDOW_MS)
      return match;
  }

  const homeId = String(match.HomeID || "");
  const awayId = String(match.AwayID || "");
  const home = needTeams && isPlaceholderTeamName(match.Home) ? best.home : match.Home;
  const away = needTeams && isPlaceholderTeamName(match.Away) ? best.away : match.Away;
  const sourceGameId = needGame && best.imSourceGameId ? best.imSourceGameId : match.SourceGameID;
  const teams
    = match.Teams?.length && !needTeams
      ? match.Teams
      : [
          { Type: "IM", GameID: sourceGameId, Name: home, TeamID: homeId.includes("-home") ? best.homeId : match.HomeID, Logo: best.homeLogo || "" },
          { Type: "IM", GameID: sourceGameId, Name: away, TeamID: awayId.includes("-away") ? best.awayId : match.AwayID, Logo: best.awayLogo || "" },
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

function imMatchIsStale(match, betsBlock) {
  const start = normalizeEpochMs(match.StartTime);
  if (start > 0 && !a8StartTimeListAllowed(start))
    return true;
  const savedAt = Number(betsBlock?.savedAt || match.savedAt) || 0;
  if (savedAt > 0 && Date.now() - savedAt > IM_ODDS_ACTIVE_MS)
    return true;
  if (start > 0 && start > Date.now() + A8_MATCH_MAX_FUTURE_MS)
    return true;
  return false;
}

// ── IM 赔率处理 ───────────────────────────────────────────────────────────────

function filterImStoredWinBets(bets) {
  return (bets || []).filter((bet) => {
    const name = pickStr(bet, "BetName", "Name", "name", "betName");
    if (name && !imBetNameIsCollectible(name))
      return false;
    return matchesSavedBet("IM", bet, { gameCode: null });
  });
}

function dedupeImBetsByMap(bets) {
  const byMap = new Map();
  for (const bet of bets) {
    const row = normalizeImBet(bet);
    const map = row.Map ?? 0;
    const prev = byMap.get(map);
    if (!prev) { byMap.set(map, row); continue; }
    if (String(row.SourceBetID || "") > String(prev.SourceBetID || ""))
      byMap.set(map, row);
  }
  return [...byMap.values()].sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
}

// ── 最终列表去重 ──────────────────────────────────────────────────────────────

function collapseImClientRows(list) {
  const imRows = [];
  const other = [];
  for (const row of list) {
    if (row.Matchs?.IM)
      imRows.push(row);
    else other.push(row);
  }
  const byKey = new Map();
  for (const row of imRows) {
    const title = String(row.Title || "").trim().toLowerCase();
    const placeholder = title.includes("主队") || title.includes("客队");
    const key = placeholder ? `ph:${row.GameID}` : `${title}|${row.GameID}`;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, row); continue; }
    const pick
      = row.Bets.length > prev.Bets.length
        || (row.Bets.length === prev.Bets.length && row.StartTime > prev.StartTime)
        ? row
        : prev;
    byKey.set(key, pick);
  }
  return [...other, ...byKey.values()].sort((a, b) => a.StartTime - b.StartTime);
}

export {
  buildTeamEnrichIndex,
  collapseImClientRows,
  dedupeImBetsByMap,
  enrichImMatch,
  filterImStoredWinBets,
  imMatchIsStale,
};
