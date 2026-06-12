/**
 * 跨平台赛事列表构建 — 仅 gamebet_matcher 使用，产出写入 client_matches。
 * 前端 Client_GetMatchs 只读该表，不在浏览器内合并。
 *
 * 子模块：
 *   teams/match_utils  — stableId / formatTitle / betKey / isPlaceholderTeamName
 *   teams/team_key     — normalizeTeam / canonicalMatchKey* / setTeamPlugin
 *   merge/im_enrich    — IM 队名补全 / 赔率处理 / collapseImClientRows
 *   merge/bet_builder  — 通用赔率过滤 + 构建
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

import { stableId, formatTitle, betKey, parseTitleTeams } from "../teams/match_utils.js";
import { PROVIDER_PRIORITY, teamsFromPlatformRows } from "../teams/provider_priority.js";
import {
  normalizeTeam,
  canonicalMatchKey,
  canonicalMatchKeyByIdOnly,
  canonicalMatchKeyByName,
  setTeamPlugin,
  lookupGbTeamIdByPlatform,
  lookupCanonicalTeamName,
} from "../teams/team_key.js";
import {
  buildTeamEnrichIndex, enrichImMatch, imMatchIsStale, collapseImClientRows,
} from "./im_enrich.js";
import { buildBetsForMatch } from "./bet_builder.js";
import { resolveClientGame, describePlatformGame, getGameCodeForPlatformId } from "../../../shared/catalog/game_catalog.mjs";
import { normalizeEpochMs, a8StartTimeListAllowed } from "../../../shared/time/match_time.mjs";

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
    Reverse: [...new Set(
      group.filter((g) => g.reversed).flatMap((g) => Object.keys(g.row.Matchs)),
    )],
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

/** 从 Matchs 关联的各平台原始赛中，按 PROVIDER_PRIORITY 取最高优先级平台的 StartTime */
function pickCanonicalStartTime(matchs, matches) {
  let bestPri = -1;
  let bestStart = 0;
  for (const [provider, sourceMatchId] of Object.entries(matchs || {})) {
    const m = findPlatformMatch(matches, provider, sourceMatchId);
    if (!m) continue;
    const pri = PROVIDER_PRIORITY[provider] || 0;
    if (pri > bestPri) {
      bestPri = pri;
      bestStart = normalizeEpochMs(m.StartTime);
    }
  }
  return bestStart;
}

function refreshClientMatchStartTimes(rows, matches) {
  for (const row of rows || []) {
    const picked = pickCanonicalStartTime(row.Matchs, matches);
    if (picked > 0) row.StartTime = picked;
  }
}

const _titleResolvers = {
  lookupGbTeamId: lookupGbTeamIdByPlatform,
  lookupCanonicalName: lookupCanonicalTeamName,
};

/** 主客均有 gb_team_id 映射时用 canonical_teams.name，否则按 PROVIDER_PRIORITY 取平台队名 */
function titleFromMatchs(matchs, matches) {
  const rows = [];
  for (const [platform, sourceMatchId] of Object.entries(matchs || {})) {
    const m = findPlatformMatch(matches, platform, sourceMatchId);
    if (!m) continue;
    rows.push({
      platform,
      home: String(m.Home ?? m.home ?? ""),
      away: String(m.Away ?? m.away ?? ""),
      homeId: String(m.HomeID ?? m.home_id ?? m.SourceHomeID ?? ""),
      awayId: String(m.AwayID ?? m.away_id ?? m.SourceAwayID ?? ""),
    });
  }
  return teamsFromPlatformRows(rows, _titleResolvers);
}

function refreshClientMatchTitles(rows, matches) {
  for (const row of rows || []) {
    const picked = titleFromMatchs(row.Matchs, matches);
    if (picked?.title) row.Title = picked.title;
  }
}

/** Title 刷新后，各 Map 盘口 HomeName/AwayName 与 canonical 主客对齐 */
function refreshClientMatchBetNames(rows) {
  for (const row of rows || []) {
    const teams = parseTitleTeams(row.Title);
    if (!teams) continue;
    for (const bet of row.Bets || []) {
      bet.HomeName = teams.home;
      bet.AwayName = teams.away;
    }
  }
}

/** 各 Map 行 Name 取自最高优先级平台的 match_winner 主盘（避免人工关联 seed 遗留错误 Name） */
function refreshClientMatchBetMapNames(rows, matches, bets, timers, sourceFromBet) {
  for (const row of rows || []) {
    const platforms = Object.keys(row.Matchs || {}).sort(
      (a, b) => (PROVIDER_PRIORITY[b] || 0) - (PROVIDER_PRIORITY[a] || 0),
    );
    for (const bet of row.Bets || []) {
      const map = bet.Map ?? 0;
      for (const platform of platforms) {
        const pm = findPlatformMatch(matches, platform, row.Matchs[platform]);
        if (!pm) continue;
        const acc = buildAccumulateRow(platform, pm, bets, timers, sourceFromBet);
        const accBet = (acc.Bets || []).find((b) => (b.Map ?? 0) === map);
        if (accBet?.Name) {
          bet.Name = accBet.Name;
          break;
        }
      }
    }
  }
}

function swapBetSource(src) {
  if (!src || typeof src !== "object") return src;
  return {
    ...src,
    HomeID: src.AwayID,
    AwayID: src.HomeID,
    HomeOdds: src.AwayOdds,
    AwayOdds: src.HomeOdds,
  };
}

/** 对齐 pipei/link_match.js analyzeSideAlignment，返回 aligned | reversed | ambiguous */
function sideAlignmentMode(pmHome, pmAway, cmHome, cmAway) {
  const ph = normalizeTeam(pmHome);
  const pa = normalizeTeam(pmAway);
  const ch = normalizeTeam(cmHome);
  const ca = normalizeTeam(cmAway);
  if (!ph || !pa || !ch || !ca) return "ambiguous";
  if (ph === ch && pa === ca) return "aligned";
  if (ph === ca && pa === ch) return "reversed";
  return "ambiguous";
}

/**
 * 按 Title canonical 主客重算 Reverse[]，并从平台原始盘口重建 Sources（含 swap）。
 * 自动合并与人工关联共用，幂等。
 */
function reconcileClientMatchReverse(rows, matches, bets, timers, sourceFromBet) {
  for (const row of rows || []) {
    const teams = parseTitleTeams(row.Title);
    if (!teams) continue;

    const reverse = [];
    for (const [platform, sourceMatchId] of Object.entries(row.Matchs || {})) {
      const pm = findPlatformMatch(matches, platform, sourceMatchId);
      if (!pm) continue;
      if (
        sideAlignmentMode(pm.Home ?? pm.home, pm.Away ?? pm.away, teams.home, teams.away) ===
        "reversed"
      ) {
        reverse.push(platform);
      }
    }
    row.Reverse = [...new Set(reverse)];

    for (const [platform, sourceMatchId] of Object.entries(row.Matchs || {})) {
      const pm = findPlatformMatch(matches, platform, sourceMatchId);
      if (!pm) continue;
      const accRow = buildAccumulateRow(platform, pm, bets, timers, sourceFromBet);
      const accByMap = new Map((accRow.Bets || []).map((b) => [b.Map ?? 0, b]));
      const shouldSwap = row.Reverse.includes(platform);

      for (const bet of row.Bets || []) {
        const raw = accByMap.get(bet.Map ?? 0)?.Sources?.[platform];
        if (!raw) continue;
        bet.Sources[platform] = shouldSwap ? swapBetSource(raw) : { ...raw };
      }
    }
  }
}

function refreshClientMatchSides(rows, matches, bets, timers, sourceFromBet) {
  refreshClientMatchTitles(rows, matches);
  refreshClientMatchBetNames(rows);
  if (bets && sourceFromBet) {
    reconcileClientMatchReverse(rows, matches, bets, timers, sourceFromBet);
    refreshClientMatchBetMapNames(rows, matches, bets, timers, sourceFromBet);
  }
}

function clientMatchRowToBuilt(cm) {
  return {
    ID: Number(cm.id),
    MergeKey: cm.merge_key ? String(cm.merge_key) : null,
    Title: String(cm.title || ""),
    Game: String(cm.game || ""),
    GameID: String(cm.game_id ?? ""),
    StartTime: normalizeEpochMs(cm.start_time),
    BO: Number(cm.bo) || 0,
    Round: Number(cm.round) || 0,
    RoundStart: Number(cm.round_start) || 0,
    Matchs: { ...(cm.matchs || {}) },
    Bets: Array.isArray(cm.bets) ? cm.bets : [],
    Reverse: Array.isArray(cm.reverse) ? cm.reverse : [],
  };
}

function applyManualMatchLinks(mergedList, matches, bets, timers, sourceFromBet, existingClientRows) {
  const links = collectManualLinks(matches);
  if (!links.length) return mergedList;

  const targetById = new Map(mergedList.map((m) => [Number(m.ID), m]));
  const linkedIds = new Set(links.map((l) => Number(l.match_id)));

  // 仅预填本次链接目标 id：晚到平台挂到已有 client 行，保留原 id / merge_key
  for (const cm of existingClientRows || []) {
    const id = Number(cm.id);
    if (!linkedIds.has(id) || !Number.isFinite(id) || targetById.has(id)) continue;
    const seeded = clientMatchRowToBuilt(cm);
    mergedList.push(seeded);
    targetById.set(id, seeded);
  }

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

    const alreadyLinked = target.Matchs?.[link.platform] === String(link.source_match_id);
    if (!alreadyLinked) {
      target.Matchs[link.platform] = String(link.source_match_id);
    }
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

  refreshClientMatchStartTimes(mergedList, matches);
  refreshClientMatchSides(mergedList, matches, bets, timers, sourceFromBet);

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
    addToKeyGroup(idGroups, ck.key, {
      row: entry.row,
      reversed: ck.reversed,
      rowKey: entry.rowKey,
    });
  }
  // 仅当 ID 组达到最少平台数时才占用 idMatched；否则回退队名阶段，避免「ID 合并未成且无法队名合并」
  for (const group of idGroups.values()) {
    if (group.length < MIN_CLIENT_MATCH_PLATFORMS) continue;
    for (const { rowKey } of group) {
      if (rowKey) idMatched.add(rowKey);
    }
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
  const list = buildMatchListMerged(normalized, bets, timers, sourceFromBet);
  refreshClientMatchSides(list, normalized, bets, timers, sourceFromBet);
  return filterMultiPlatformClientMatches(list);
}

export {
  MERGE_MODE,
  MIN_CLIENT_MATCH_PLATFORMS,
  clientMatchPlatformCount,
  filterMultiPlatformClientMatches,
  buildClientMatchList,
  buildMatchListAccumulate,
  buildMatchListMerged,
  buildAccumulateRow,
  clientMatchRowToBuilt,
  applyManualMatchLinks,
  collectManualLinks,
  normalizeMatchesShape,
  pickCanonicalStartTime,
  titleFromMatchs,
  refreshClientMatchTitles,
  refreshClientMatchBetNames,
  refreshClientMatchSides,
  reconcileClientMatchReverse,
  swapBetSource,
  sideAlignmentMode,
  PROVIDER_PRIORITY,
  stableId,
  normalizeTeam,
  canonicalMatchKey,
  canonicalMatchKeyByIdOnly,
  canonicalMatchKeyByName,
  setTeamPlugin,
};
