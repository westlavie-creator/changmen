"use strict";

/**
 * 跨平台赛事列表构建（Client_GetMatchs）。
 *
 * 子模块：
 *   match_utils  — stableId / formatTitle / betKey / isPlaceholderTeamName
 *   team_key     — normalizeTeam / canonicalMatchKey* / setTeamPlugin
 *   im_enrich    — IM 队名补全 / 赔率处理 / collapseImClientRows
 *   bet_builder  — 通用赔率过滤 + 构建
 */

const MERGE_MODE = "merge";

/** 写入 client_matches 所需的最少平台数（跨平台匹配成功） */
const MIN_CLIENT_MATCH_PLATFORMS = 2;

function clientMatchPlatformCount(row) {
  return Object.keys(row?.Matchs || {}).length;
}

function filterMultiPlatformClientMatches(list) {
  return (list || []).filter((m) => clientMatchPlatformCount(m) >= MIN_CLIENT_MATCH_PLATFORMS);
}

const { stableId, formatTitle, betKey } = require("./match_utils");
const {
  normalizeTeam,
  canonicalMatchKey,
  canonicalMatchKeyByIdOnly,
  canonicalMatchKeyByName,
  setTeamPlugin,
} = require("./team_key");
const {
  buildTeamEnrichIndex, enrichImMatch, imMatchIsStale, collapseImClientRows,
} = require("./im_enrich");
const { buildBetsForMatch } = require("./bet_builder");

const { resolveClientGame, describePlatformGame, getGameCodeForPlatformId } = require("../shared/game_catalog");
const { normalizeEpochMs, a8StartTimeListAllowed } = require("../integrations/a8/match_time.js");

/** 平台优先级：决定合并行取哪个平台的 Title/Game 作为规范值 */
const PROVIDER_PRIORITY = { OB: 10, RAY: 9, PB: 8, TF: 7, IA: 6, IMT: 5, IM: 4, SABA: 3, HG: 2 };

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
  const mergeKey = `match:single:${provider}:${sourceMatchId}`;
  const { round, roundStart } = liveRound(timers, provider, sourceMatchId);
  const sourceGameId = match.SourceGameID ?? match.GameID;
  const { Game, GameID } = resolveClientGame(provider, sourceGameId);
  const gameCode = describePlatformGame(provider, sourceGameId).gameCode;
  const matchTeams = provider === "IM"
    ? { home: String(match.Home || "").trim(), away: String(match.Away || "").trim() }
    : undefined;
  return {
    MergeKey: mergeKey,
    Title: formatTitle(match.Home, match.Away),
    StartTime: normalizeEpochMs(match.StartTime),
    Game, GameID,
    BO: Number(match.BO) || 0,
    Matchs: { [provider]: sourceMatchId },
    Bets: buildBetsForMatch(provider, sourceMatchId, 0, bets, sourceFromBet, gameCode, matchTeams),
    Round: round,
    RoundStart: roundStart,
    Reverse: Array.isArray(match.Reverse) ? match.Reverse : [],
  };
}

// ── 合并逻辑 ──────────────────────────────────────────────────────────────────

function mergeGroupWithKey(group, mergeKey) {
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
      ID: stableId(`bet:pending:${mergeKey}:${map}`),
      MatchID: 0,
      Sources: sources,
    }));

  return {
    MergeKey: mergeKey,
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

function addToKeyGroup(groups, mapKey, entry) {
  if (!groups.has(mapKey)) groups.set(mapKey, []);
  const bucket = groups.get(mapKey);
  const existIdx = bucket.findIndex((e) => e.row._provider === entry.row._provider);
  if (existIdx >= 0) {
    if (entry.row.StartTime > bucket[existIdx].row.StartTime) bucket[existIdx] = entry;
  } else {
    bucket.push(entry);
  }
}

function finalizeKeyGroups(keyGroups, mergeBasis) {
  const result = [];
  for (const [key, group] of keyGroups) {
    if (group.length < MIN_CLIENT_MATCH_PLATFORMS) continue;
    const out = mergeGroupWithKey(group, key);
    out.MergeBasis = mergeBasis;
    delete out._provider;
    result.push(out);
  }
  return result;
}

function collectManualLinkKeys(matches) {
  const keys = new Set();
  for (const [provider, byId] of Object.entries(matches || {})) {
    if (!byId) continue;
    for (const match of Object.values(byId)) {
      const cid = match?.ClientMatchId ?? match?.client_match_id ?? match?.match_id;
      if (cid != null && cid !== "") {
        keys.add(`${provider}:${String(match.SourceMatchID)}`);
      }
    }
  }
  return keys;
}

function collectManualLinks(matches) {
  const links = [];
  for (const [provider, byId] of Object.entries(matches || {})) {
    if (!byId) continue;
    for (const match of Object.values(byId)) {
      const cid = match?.ClientMatchId ?? match?.client_match_id ?? match?.match_id;
      if (cid == null || cid === "") continue;
      links.push({
        platform: provider,
        source_match_id: String(match.SourceMatchID),
        match_id: Number(cid),
      });
    }
  }
  return links;
}

/** platform_matches 数组 → { platform: { sourceId: row } } */
function normalizeMatchesShape(raw) {
  const out = {};
  for (const [provider, block] of Object.entries(raw || {})) {
    if (!block) continue;
    if (Array.isArray(block)) {
      out[provider] = {};
      for (const m of block) {
        if (m?.SourceMatchID != null) out[provider][String(m.SourceMatchID)] = m;
      }
    } else if (typeof block === "object") {
      out[provider] = block;
    }
  }
  return out;
}

function findPlatformMatch(matches, provider, sourceMatchId) {
  const sid = String(sourceMatchId);
  const byId = matches?.[provider];
  if (!byId) return null;
  if (byId[sid]) return byId[sid];
  return Object.values(byId).find((m) => String(m.SourceMatchID) === sid) || null;
}

function applyManualMatchLinks(mergedList, matches, bets, timers, sourceFromBet) {
  const links = collectManualLinks(matches);
  if (!links.length) return mergedList;

  const targetById = new Map(mergedList.map((m) => [Number(m.ID), m]));

  for (const row of mergedList) {
    for (const link of links) {
      const sid = String(link.source_match_id);
      if (row.Matchs?.[link.platform] === sid && Number(row.ID) !== Number(link.match_id)) {
        delete row.Matchs[link.platform];
        if (Array.isArray(row.Bets)) {
          for (const bet of row.Bets) {
            if (bet.Sources?.[link.platform]) delete bet.Sources[link.platform];
          }
          row.Bets = row.Bets.filter((b) => Object.keys(b.Sources || {}).length > 0);
        }
      }
    }
  }

  for (const link of links) {
    const targetId = Number(link.match_id);
    const match = findPlatformMatch(matches, link.platform, link.source_match_id);
    if (!match) continue;

    const row = buildAccumulateRow(link.platform, match, bets, timers, sourceFromBet);
    let target = targetById.get(targetId);

    if (!target) {
      row.ID = targetId;
      row.Bets = (row.Bets || []).map((b) => ({
        ...b,
        ID: stableId(`bet:${targetId}:${b.Map ?? 0}`),
        MatchID: targetId,
      }));
      mergedList.push(row);
      targetById.set(targetId, row);
      continue;
    }

    if (target.Matchs?.[link.platform] === String(link.source_match_id)) continue;

    target.Matchs[link.platform] = String(link.source_match_id);
    const betByMap = new Map((target.Bets || []).map((b) => [b.Map ?? 0, b]));
    for (const bet of row.Bets || []) {
      const map = bet.Map ?? 0;
      const existing = betByMap.get(map);
      if (existing) {
        Object.assign(existing.Sources, bet.Sources);
      } else {
        const nb = {
          ...bet,
          ID: stableId(`bet:${targetId}:${map}`),
          MatchID: targetId,
        };
        target.Bets = target.Bets || [];
        target.Bets.push(nb);
        betByMap.set(map, nb);
      }
    }
  }

  return filterMultiPlatformClientMatches(mergedList)
    .sort((a, b) => a.StartTime - b.StartTime);
}

function collectMergeEntries(matches, bets, timers, sourceFromBet) {
  const teamIndex = buildTeamEnrichIndex(matches);
  const manualKeys = collectManualLinkKeys(matches);
  const entries = [];

  for (const [provider, byId] of Object.entries(matches || {})) {
    if (!byId || typeof byId !== "object") continue;
    for (const match of Object.values(byId)) {
      if (!match?.SourceMatchID) continue;
      const rowKey = `${provider}:${String(match.SourceMatchID)}`;
      if (manualKeys.has(rowKey)) continue;
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

      entries.push({
        rowKey: `${provider}:${String(m.SourceMatchID)}`,
        row,
        home: String(m.Home || ""),
        away: String(m.Away || ""),
        gameId: row.GameID,
        gameCode,
        ctx: { provider, homeId: String(m.HomeID || ""), awayId: String(m.AwayID || "") },
      });
    }
  }
  return entries;
}

// ── 主入口 ────────────────────────────────────────────────────────────────────

function buildMatchListMerged(matches, bets, timers, sourceFromBet) {
  const entries = collectMergeEntries(matches, bets, timers, sourceFromBet);
  const idGroups = new Map();
  const nameGroups = new Map();
  const idMatched = new Set();

  // 第一阶段：各平台 home_id / away_id 均已映射 → 按 canonical_id 合并
  for (const entry of entries) {
    const ck = canonicalMatchKeyByIdOnly(entry.gameId, entry.home, entry.away, entry.gameCode, entry.ctx);
    if (!ck) continue;
    idMatched.add(entry.rowKey);
    addToKeyGroup(idGroups, ck.key, { row: entry.row, reversed: ck.reversed });
  }

  // 第二阶段：未进入第一阶段的场次 → 按归一化队名合并
  for (const entry of entries) {
    if (idMatched.has(entry.rowKey)) continue;
    const ck = canonicalMatchKeyByName(entry.gameId, entry.home, entry.away);
    const mapKey = ck ? ck.mergeKey : entry.row.MergeKey;
    const reversed = ck ? ck.reversed : false;
    addToKeyGroup(nameGroups, mapKey, { row: entry.row, reversed });
  }

  const result = [
    ...finalizeKeyGroups(idGroups, "id"),
    ...finalizeKeyGroups(nameGroups, "name"),
  ];

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

/** 仅自动合并（一/二阶段）；人工关联在分配自增 id 后由 rebuild 调用 applyManualMatchLinks */
function buildClientMatchList({ matches, bets, timers, sourceFromBet }) {
  const normalized = normalizeMatchesShape(matches);
  return filterMultiPlatformClientMatches(
    buildMatchListMerged(normalized, bets, timers, sourceFromBet)
  );
}

module.exports = {
  MERGE_MODE,
  MIN_CLIENT_MATCH_PLATFORMS,
  clientMatchPlatformCount,
  filterMultiPlatformClientMatches,
  buildClientMatchList,
  buildMatchListAccumulate,
  buildMatchListMerged,
  buildAccumulateRow,
  applyManualMatchLinks,
  collectManualLinks,
  normalizeMatchesShape,
  stableId,
  normalizeTeam,
  canonicalMatchKey,
  canonicalMatchKeyByIdOnly,
  canonicalMatchKeyByName,
  setTeamPlugin,
};
