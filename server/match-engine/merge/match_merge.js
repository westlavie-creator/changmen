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

import { describePlatformGame, getGameCodeForPlatformId, resolveClientGame } from "@changmen/shared/catalog/game_catalog";
import { resolvePlatformTeamId } from "@changmen/shared/catalog/pb_team_platform_id";
import { a8StartTimeListAllowed, normalizeEpochMs } from "@changmen/shared/time/match_time";
import {
  betKey,
  formatTitle,
  parseTitleTeams,
  stableBetId,
  stableId,
  stablePendingBetId,
} from "../teams/match_utils.js";
import { PROVIDER_PRIORITY, teamsFromPlatformRows } from "../teams/provider_priority.js";
import {
  anchorGbValidForGame,
  canonicalMatchKey,
  canonicalMatchKeyByIdOnly,
  canonicalMatchKeyByName,
  lookupCanonicalTeamName,
  lookupGbTeamIdByName,
  lookupGbTeamIdByPlatform,
  normalizeTeam,
  setTeamPlugin,
} from "../teams/team_key.js";
import { buildBetsForMatch } from "./bet_builder.js";
import {
  buildTeamEnrichIndex,
  collapseImClientRows,
  enrichImMatch,
  imMatchIsStale,
} from "./im_enrich.js";
import { startTimesCompatible, startTimesCompatibleStrict } from "./merge_constants.js";

const MERGE_MODE = "merge";

/** 写入 client_matches 所需的最少平台数（跨平台匹配成功） */
const MIN_CLIENT_MATCH_PLATFORMS = 2;

function clientMatchPlatformCount(row) {
  return Object.keys(row?.Matchs || {}).length;
}

function filterMultiPlatformClientMatches(list) {
  return (list || []).filter(m => clientMatchPlatformCount(m) >= MIN_CLIENT_MATCH_PLATFORMS);
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function liveRound(timers, provider, sourceMatchId) {
  const block = timers?.[provider];
  const arr = block?.timer;
  if (!Array.isArray(arr))
    return { round: 0, roundStart: 0 };
  const sid = String(sourceMatchId);
  const hit = arr.find(x => String(x.matchId ?? x.SourceMatchID ?? x.MatchID ?? "") === sid);
  if (!hit)
    return { round: 0, roundStart: 0 };
  return {
    round: Number(hit.round ?? hit.Round ?? hit.Map ?? hit.roundId ?? 0) || 0,
    roundStart: Number(hit.startTime ?? hit.StartTime ?? hit.RoundStart ?? 0) || 0,
  };
}

function timerSnapshotProviders(match, timersByProvider) {
  return Object.entries(match.Matchs || {})
    .map(([provider, sourceId]) => ({
      provider,
      sourceId: String(sourceId),
      pri: PROVIDER_PRIORITY[provider] || 0,
    }))
    .filter(({ provider }) => Array.isArray(timersByProvider?.[provider]?.timer))
    .sort((a, b) => b.pri - a.pri);
}

/** matcher matchMerge + Client_GetMatchs overlay：用 live timer 快照刷新 Round/RoundStart */
function refreshClientMatchRoundsFromTimers(rows, timersByProvider) {
  if (!Array.isArray(rows))
    return;
  const timers = timersByProvider || {};
  for (const m of rows) {
    const linked = timerSnapshotProviders(m, timers);
    if (!linked.length)
      continue;
    let round = 0;
    let roundStart = 0;
    for (const { provider, sourceId } of linked) {
      const hit = liveRound(timers, provider, sourceId);
      if (hit.round > 0) {
        round = hit.round;
        roundStart = hit.roundStart;
        break;
      }
    }
    if (round > 0) {
      m.Round = round;
      if (roundStart > 0)
        m.RoundStart = roundStart;
    }
    // Round 清零仅由 applyObLiveRoundGate 处理；此处不清零，避免 trim 前 Round 被抹掉
  }
}

function obTimerMatchIds(timersByProvider) {
  const arr = timersByProvider?.OB?.timer;
  if (!Array.isArray(arr))
    return null;
  return new Set(
    arr.map(t => String(t.matchId ?? t.SourceMatchID ?? t.MatchID ?? "")).filter(Boolean),
  );
}

/** is_live≠2、已不在 OB index、或已不在 OB timer 批次时清零 Round（读路径 + matcher matchMerge） */
function applyObLiveRoundGate(rows, platformMatches, timersByProvider) {
  if (!Array.isArray(rows))
    return rows;
  const obById = platformMatches?.OB;
  if (!obById || typeof obById !== "object")
    return rows;
  const timerIds = obTimerMatchIds(timersByProvider);
  return rows.map((m) => {
    const obId = m.Matchs?.OB;
    if (obId == null || obId === "")
      return m;
    const sid = String(obId);
    const round = Number(m.Round) || 0;
    const roundStart = Number(m.RoundStart) || 0;
    if (!round && !roundStart)
      return m;

    const row = obById[sid];
    const raw = row?.IsLive ?? row?.is_live;

    if (row == null) {
      // OB 已不再上报此比赛（SaveMatch 停止） → 比赛结束，清零 Round
      return { ...m, Round: 0, RoundStart: 0 };
    }

    if (raw != null && raw !== "" && Number(raw) !== 2) {
      return { ...m, Round: 0, RoundStart: 0 };
    }

    if (timerIds != null && !timerIds.has(sid)) {
      return { ...m, Round: 0, RoundStart: 0 };
    }

    return m;
  });
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
    Game,
    GameID,
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
  for (const { row } of group) {
    for (const bet of row.Bets) {
      const map = bet.Map ?? 0;
      if (!byMap.has(map))
        byMap.set(map, { canonBet: bet, sources: {} });
      const entry = byMap.get(map);
      for (const [p, src] of Object.entries(bet.Sources)) {
        entry.sources[p] = { ...src };
      }
    }
  }

  const mergedBets = [...byMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([map, { canonBet, sources }]) => ({
      ...canonBet,
      ID: stablePendingBetId(mergeKey, map),
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
    Reverse: [],
  };
}

/** 同 merge 键下按开赛时间 ±15min 拆分子组，避免同日多赛误合并 */
function findCompatibleGroupKey(groups, baseKey, startMs, { strictTime = false, soloKey = "" } = {}) {
  const st = normalizeEpochMs(startMs);
  if (strictTime && !st) {
    return `${baseKey}@notime:${soloKey || "unknown"}`;
  }
  for (const [key, bucket] of groups) {
    if (key !== baseKey && !key.startsWith(`${baseKey}@`))
      continue;
    const refStart = bucket[0]?.row?.StartTime ?? 0;
    const compatible = strictTime
      ? startTimesCompatibleStrict(st, refStart)
      : startTimesCompatible(st, refStart);
    if (compatible)
      return key;
  }
  if (st)
    return `${baseKey}@${st}`;
  return strictTime ? `${baseKey}@notime:${soloKey || "unknown"}` : baseKey;
}

function addToKeyGroup(groups, mapKey, entry, options) {
  const soloKey = entry.rowKey || entry.row?._provider || "unknown";
  const resolvedKey = findCompatibleGroupKey(groups, mapKey, entry.row.StartTime, {
    ...options,
    soloKey,
  });
  if (!groups.has(resolvedKey))
    groups.set(resolvedKey, []);
  const bucket = groups.get(resolvedKey);
  const existIdx = bucket.findIndex(e => e.row._provider === entry.row._provider);
  if (existIdx >= 0) {
    if (entry.row.StartTime > bucket[existIdx].row.StartTime)
      bucket[existIdx] = entry;
  }
  else {
    bucket.push(entry);
  }
}

function finalizeKeyGroups(keyGroups, mergeBasis) {
  const result = [];
  for (const [key, group] of keyGroups) {
    if (group.length < MIN_CLIENT_MATCH_PLATFORMS)
      continue;
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
    if (!byId)
      continue;
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
    if (!byId)
      continue;
    for (const match of Object.values(byId)) {
      const cid = match?.ClientMatchId ?? match?.client_match_id ?? match?.match_id;
      if (cid == null || cid === "")
        continue;
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
    if (!block)
      continue;
    if (Array.isArray(block)) {
      out[provider] = {};
      for (const m of block) {
        if (m?.SourceMatchID != null)
          out[provider][String(m.SourceMatchID)] = m;
      }
    }
    else if (typeof block === "object") {
      out[provider] = block;
    }
  }
  return out;
}

function findPlatformMatch(matches, provider, sourceMatchId) {
  const sid = String(sourceMatchId);
  const byId = matches?.[provider];
  if (!byId)
    return null;
  if (byId[sid])
    return byId[sid];
  return Object.values(byId).find(m => String(m.SourceMatchID) === sid) || null;
}

/** 从 Matchs 关联的各平台原始赛中，按 PROVIDER_PRIORITY 取最高优先级平台的 StartTime */
function pickCanonicalStartTime(matchs, matches) {
  let bestPri = -1;
  let bestStart = 0;
  for (const [provider, sourceMatchId] of Object.entries(matchs || {})) {
    const m = findPlatformMatch(matches, provider, sourceMatchId);
    if (!m)
      continue;
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
    if (picked > 0)
      row.StartTime = picked;
  }
}

function isUnknownClientGame(game) {
  return /^未知\(.+\)$/.test(String(game || "").trim());
}

/** 从关联平台原始赛按优先级取 Game；catalog 已知优先于未知 */
function pickCanonicalGame(matchs, matches) {
  let bestKnownPri = -1;
  let bestKnown = { Game: "", GameID: 0 };
  let bestUnknownPri = -1;
  let bestUnknown = { Game: "", GameID: 0 };

  for (const [provider, sourceMatchId] of Object.entries(matchs || {})) {
    const m = findPlatformMatch(matches, provider, sourceMatchId);
    if (!m)
      continue;
    const pri = PROVIDER_PRIORITY[provider] || 0;
    const sourceGameId = m.SourceGameID ?? m.GameID;
    const info = describePlatformGame(provider, sourceGameId);
    const { Game, GameID } = resolveClientGame(provider, sourceGameId);
    if (!Game)
      continue;
    if (info.inCatalog) {
      if (pri > bestKnownPri) {
        bestKnownPri = pri;
        bestKnown = { Game, GameID };
      }
    }
    else if (pri > bestUnknownPri) {
      bestUnknownPri = pri;
      bestUnknown = { Game, GameID };
    }
  }

  if (bestKnown.Game)
    return bestKnown;
  return bestUnknown;
}

function refreshClientMatchGames(rows, matches) {
  for (const row of rows || []) {
    const picked = pickCanonicalGame(row.Matchs, matches);
    if (!picked.Game)
      continue;
    if (!row.Game || isUnknownClientGame(row.Game)) {
      row.Game = picked.Game;
      row.GameID = picked.GameID;
    }
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
    if (!m)
      continue;
    const sourceGameId = m.SourceGameID ?? m.GameID;
    const gameCode = getGameCodeForPlatformId(platform, sourceGameId);
    rows.push({
      platform,
      home: String(m.Home ?? m.home ?? ""),
      away: String(m.Away ?? m.away ?? ""),
      homeId: resolvePlatformTeamId(
        platform,
        m.HomeID ?? m.home_id ?? m.SourceHomeID,
        sourceGameId,
        gameCode,
      ),
      awayId: resolvePlatformTeamId(
        platform,
        m.AwayID ?? m.away_id ?? m.SourceAwayID,
        sourceGameId,
        gameCode,
      ),
    });
  }
  return teamsFromPlatformRows(rows, _titleResolvers);
}

function refreshClientMatchTitles(rows, matches) {
  refreshClientMatchCanonicalOrientation(rows, matches, null);
}

function parseLockedGbTeamId(value) {
  if (value == null || value === "")
    return null;
  const s = String(value).trim();
  return s || null;
}

function buildPlatformRowsForMatchs(matchs, matches) {
  const rows = [];
  for (const [platform, sourceMatchId] of Object.entries(matchs || {})) {
    const m = findPlatformMatch(matches, platform, sourceMatchId);
    if (!m)
      continue;
    const sourceGameId = m.SourceGameID ?? m.GameID;
    const gameCode = getGameCodeForPlatformId(platform, sourceGameId);
    rows.push({
      platform,
      home: String(m.Home ?? m.home ?? ""),
      away: String(m.Away ?? m.away ?? ""),
      homeId: resolvePlatformTeamId(
        platform,
        m.HomeID ?? m.home_id ?? m.SourceHomeID,
        sourceGameId,
        gameCode,
      ),
      awayId: resolvePlatformTeamId(
        platform,
        m.AwayID ?? m.away_id ?? m.SourceAwayID,
        sourceGameId,
        gameCode,
      ),
    });
  }
  return rows;
}

/** 本场 gameCode：GameID / Game 括号 / 关联 platform_match */
function resolveGameCodeForClientRow(row, matches) {
  const gid = String(row?.GameID ?? "").trim();
  const a8Map = { 1: "lol", 2: "dota2", 3: "cs2", 4: "kog", 8: "valorant" };
  let gameCode = a8Map[gid] || a8Map[Number(gid)] || null;
  if (!gameCode && row?.Game) {
    const parsed = String(row.Game).match(/\(([^)]+)\)\s*$/);
    if (parsed)
      gameCode = parsed[1].toLowerCase();
  }
  if (!gameCode && row?.Matchs && matches) {
    for (const [platform, sourceMatchId] of Object.entries(row.Matchs)) {
      const pm = findPlatformMatch(matches, platform, sourceMatchId);
      if (!pm)
        continue;
      const sourceGameId = pm.SourceGameID ?? pm.GameID;
      gameCode = getGameCodeForPlatformId(platform, sourceGameId);
      if (gameCode)
        break;
    }
  }
  return gameCode || null;
}

/** 新场次：按平台优先级 + team map 推断 canonical 主客 gb */
function pickCanonicalGbFromMatchs(matchs, matches, gameCode) {
  const picked = titleFromMatchs(matchs, matches);
  if (!picked?.home || !picked?.away)
    return null;

  const homeGbByName = lookupGbTeamIdByName(picked.home, gameCode);
  const awayGbByName = lookupGbTeamIdByName(picked.away, gameCode);
  if (homeGbByName && awayGbByName) {
    return {
      homeGb: parseLockedGbTeamId(homeGbByName),
      awayGb: parseLockedGbTeamId(awayGbByName),
    };
  }

  const rows = buildPlatformRowsForMatchs(matchs, matches);
  const refRow = rows.find(r => r.platform === picked.platform);
  if (!refRow)
    return null;

  const slotHomeGb = lookupGbTeamIdByPlatform(refRow.platform, refRow.homeId);
  const slotAwayGb = lookupGbTeamIdByPlatform(refRow.platform, refRow.awayId);
  if (!slotHomeGb || !slotAwayGb)
    return null;

  const mode = sideAlignmentMode(refRow.home, refRow.away, picked.home, picked.away);
  if (mode === "aligned") {
    return {
      homeGb: parseLockedGbTeamId(slotHomeGb),
      awayGb: parseLockedGbTeamId(slotAwayGb),
    };
  }
  if (mode === "reversed") {
    return {
      homeGb: parseLockedGbTeamId(slotAwayGb),
      awayGb: parseLockedGbTeamId(slotHomeGb),
    };
  }
  return null;
}

function titleFromLockedGb(homeGb, awayGb, fallbackTitle) {
  const homeName = lookupCanonicalTeamName(homeGb) || parseTitleTeams(fallbackTitle)?.home;
  const awayName = lookupCanonicalTeamName(awayGb) || parseTitleTeams(fallbackTitle)?.away;
  if (!homeName || !awayName)
    return fallbackTitle || "";
  return formatTitle(homeName, awayName);
}

/**
 * 锁定 canonical 主客 gb；DB 已有锁则不随高优先级平台加入而翻转 Title。
 * Title 从锁定 gb 派生队名。
 */
function refreshClientMatchCanonicalOrientation(rows, matches, existingClientRows) {
  const existingById = new Map(
    (existingClientRows || []).map(cm => [Number(cm.id), cm]),
  );

  for (const row of rows || []) {
    const cmId = Number(row.ID);
    const existing = Number.isFinite(cmId) && cmId > 0 ? existingById.get(cmId) : null;
    const gameCode = resolveGameCodeForClientRow(row, matches);

    // DB 锁优先：首轮 merge 写入的 HomeGbTeamId 不得覆盖已有 client_matches 锚点
    let homeGb = parseLockedGbTeamId(existing?.home_gb_team_id)
      ?? parseLockedGbTeamId(row.HomeGbTeamId);
    let awayGb = parseLockedGbTeamId(existing?.away_gb_team_id)
      ?? parseLockedGbTeamId(row.AwayGbTeamId);

    if (homeGb && !anchorGbValidForGame(homeGb, gameCode))
      homeGb = null;
    if (awayGb && !anchorGbValidForGame(awayGb, gameCode))
      awayGb = null;

    if (!homeGb || !awayGb) {
      const picked = pickCanonicalGbFromMatchs(row.Matchs, matches, gameCode);
      if (picked) {
        homeGb = picked.homeGb;
        awayGb = picked.awayGb;
      }
    }

    if (!homeGb || !awayGb) {
      const teams = parseTitleTeams(row.Title);
      if (teams) {
        homeGb = homeGb || parseLockedGbTeamId(lookupGbTeamIdByName(teams.home, gameCode));
        awayGb = awayGb || parseLockedGbTeamId(lookupGbTeamIdByName(teams.away, gameCode));
      }
    }

    if (homeGb && awayGb) {
      row.HomeGbTeamId = homeGb;
      row.AwayGbTeamId = awayGb;
      row.Title = titleFromLockedGb(homeGb, awayGb, row.Title);
    }
    else {
      const picked = titleFromMatchs(row.Matchs, matches);
      if (picked?.title)
        row.Title = picked.title;
    }
  }
}

/** Title 刷新后，各 Map 盘口 HomeName/AwayName 与 canonical 主客对齐 */
function refreshClientMatchBetNames(rows) {
  for (const row of rows || []) {
    const teams = parseTitleTeams(row.Title);
    if (!teams)
      continue;
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
        if (!pm)
          continue;
        const acc = buildAccumulateRow(platform, pm, bets, timers, sourceFromBet);
        const accBet = (acc.Bets || []).find(b => (b.Map ?? 0) === map);
        if (accBet?.Name) {
          bet.Name = accBet.Name;
          break;
        }
      }
    }
  }
}

function swapBetSource(src) {
  if (!src || typeof src !== "object")
    return src;
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
  if (!ph || !pa || !ch || !ca)
    return "ambiguous";
  if (ph === ch && pa === ca)
    return "aligned";
  if (ph === ca && pa === ch)
    return "reversed";
  return "ambiguous";
}

/** canonical ID 回退：队名 ambiguous 时用 team_venue_maps 判断 aligned / reversed */
function sideAlignmentByCanonicalId(platform, pm, refCanonIds) {
  if (!refCanonIds)
    return "ambiguous";
  const sourceGameId = pm.SourceGameID ?? pm.GameID;
  const gameCode = getGameCodeForPlatformId(platform, sourceGameId);
  const homeId = resolvePlatformTeamId(
    platform,
    pm.HomeID ?? pm.home_id ?? pm.SourceHomeID,
    sourceGameId,
    gameCode,
  );
  const awayId = resolvePlatformTeamId(
    platform,
    pm.AwayID ?? pm.away_id ?? pm.SourceAwayID,
    sourceGameId,
    gameCode,
  );
  const hcid = lookupGbTeamIdByPlatform(platform, homeId);
  const acid = lookupGbTeamIdByPlatform(platform, awayId);
  if (!hcid || !acid)
    return "ambiguous";
  if (hcid === refCanonIds.home && acid === refCanonIds.away)
    return "aligned";
  if (hcid === refCanonIds.away && acid === refCanonIds.home)
    return "reversed";
  return "ambiguous";
}

/** 从队名已确定的平台中取 canonical home/away ID 作为参考（支持 aligned 和 reversed） */
function resolveRefCanonIds(resolvedPlatforms, matches) {
  for (const { platform, sourceMatchId, reversed } of resolvedPlatforms) {
    const pm = findPlatformMatch(matches, platform, sourceMatchId);
    if (!pm)
      continue;
    const sourceGameId = pm.SourceGameID ?? pm.GameID;
    const gameCode = getGameCodeForPlatformId(platform, sourceGameId);
    const homeId = resolvePlatformTeamId(
      platform,
      pm.HomeID ?? pm.home_id ?? pm.SourceHomeID,
      sourceGameId,
      gameCode,
    );
    const awayId = resolvePlatformTeamId(
      platform,
      pm.AwayID ?? pm.away_id ?? pm.SourceAwayID,
      sourceGameId,
      gameCode,
    );
    const hcid = lookupGbTeamIdByPlatform(platform, homeId);
    const acid = lookupGbTeamIdByPlatform(platform, awayId);
    if (!hcid || !acid)
      continue;
    return reversed ? { home: acid, away: hcid } : { home: hcid, away: acid };
  }
  return null;
}

/**
 * 按 Title 主客重算 Reverse[]，并从平台原始盘口重建 Sources（含 swap）。
 * platformSideOverrides：force_aligned / force_reversed；无覆盖则 gb → 队名 → ambiguous。
 * ambiguous：不进 Reverse；Map=0 省略 Sources；Map>0 保留原生盘（不 swap）。
 */
function platformOverridesForRow(platformSideOverrides, rowId) {
  const id = Number(rowId);
  if (!platformSideOverrides || !Number.isFinite(id) || id <= 0)
    return {};
  return platformSideOverrides[id] || {};
}

function applyPlatformSideOverride(finalMode, overrideMode) {
  if (overrideMode === "force_reversed")
    return "reversed";
  if (overrideMode === "force_aligned")
    return "aligned";
  return finalMode;
}

function reconcileClientMatchReverse(rows, matches, bets, timers, sourceFromBet, platformSideOverrides) {
  for (const row of rows || []) {
    const teams = parseTitleTeams(row.Title);
    if (!teams)
      continue;

    const rowOverrides = platformOverridesForRow(platformSideOverrides, row.ID);
    const gameCode = resolveGameCodeForClientRow(row, matches);

    // 收集各平台的 platform_match 和队名匹配结果
    const platformEntries = {};
    for (const [platform, sourceMatchId] of Object.entries(row.Matchs || {})) {
      const pm = findPlatformMatch(matches, platform, sourceMatchId);
      if (!pm)
        continue;
      const nameMode = sideAlignmentMode(
        pm.Home ?? pm.home,
        pm.Away ?? pm.away,
        teams.home,
        teams.away,
      );
      platformEntries[platform] = { nameMode, sourceMatchId, pm };
    }

    // 构建 refCanonIds：锁定 gb 优先；否则 Title 队名 gb；再回落队名已确定的平台
    let refIds = null;
    const lockedHome = parseLockedGbTeamId(row.HomeGbTeamId);
    const lockedAway = parseLockedGbTeamId(row.AwayGbTeamId);
    if (lockedHome && lockedAway
      && anchorGbValidForGame(lockedHome, gameCode)
      && anchorGbValidForGame(lockedAway, gameCode)) {
      refIds = { home: lockedHome, away: lockedAway };
    }
    if (!refIds) {
      const titleHomeGb = lookupGbTeamIdByName(teams.home, gameCode);
      const titleAwayGb = lookupGbTeamIdByName(teams.away, gameCode);
      if (titleHomeGb && titleAwayGb) {
        refIds = { home: titleHomeGb, away: titleAwayGb };
      }
    }
    if (!refIds) {
      const nameResolved = Object.entries(platformEntries)
        .filter(([, v]) => v.nameMode === "aligned" || v.nameMode === "reversed")
        .map(([platform, v]) => ({ platform, sourceMatchId: v.sourceMatchId, reversed: v.nameMode === "reversed" }));
      refIds = resolveRefCanonIds(nameResolved, matches);
    }

    const reverse = [];
    const ambiguousPlatforms = [];
    for (const [platform, { nameMode, pm }] of Object.entries(platformEntries)) {
      const idMode = refIds ? sideAlignmentByCanonicalId(platform, pm, refIds) : "ambiguous";
      let finalMode = idMode !== "ambiguous" ? idMode : nameMode;
      finalMode = applyPlatformSideOverride(finalMode, rowOverrides[platform]);

      if (finalMode === "reversed") {
        reverse.push(platform);
      }
      else if (finalMode === "ambiguous") {
        ambiguousPlatforms.push(platform);
        console.warn(
          `[match_merge] 主客 ambiguous · client #${row.ID ?? "?"} · ${platform}`
          + ` · Title「${teams.home} vs ${teams.away}」`
          + ` · 平台「${pm.Home ?? pm.home} vs ${pm.Away ?? pm.away}」`,
        );
      }
    }

    row.Reverse = [...new Set(reverse)];
    if (ambiguousPlatforms.length) {
      row.SideAlignAmbiguous = [...new Set(ambiguousPlatforms)];
    }
    else {
      delete row.SideAlignAmbiguous;
    }

    const ambiguousSet = new Set(ambiguousPlatforms);
    for (const [platform] of Object.entries(row.Matchs || {})) {
      const pm = findPlatformMatch(matches, platform, row.Matchs[platform]);
      if (!pm)
        continue;
      const accRow = buildAccumulateRow(platform, pm, bets, timers, sourceFromBet);
      const accByMap = new Map((accRow.Bets || []).map(b => [b.Map ?? 0, b]));

      if (ambiguousSet.has(platform)) {
        // 全场盘 Map=0 省略 Sources（主客未对齐，不可套利）；局分/决胜局 Map>0 仍展示原生盘
        for (const bet of row.Bets || []) {
          const mapNum = bet.Map ?? 0;
          if (mapNum === 0) {
            if (bet.Sources?.[platform])
              delete bet.Sources[platform];
          }
          else {
            const raw = accByMap.get(mapNum)?.Sources?.[platform];
            if (raw)
              bet.Sources[platform] = { ...raw };
            else if (bet.Sources?.[platform])
              delete bet.Sources[platform];
          }
        }
        continue;
      }

      const shouldSwap = row.Reverse.includes(platform);
      for (const bet of row.Bets || []) {
        const raw = accByMap.get(bet.Map ?? 0)?.Sources?.[platform];
        if (raw) {
          bet.Sources[platform] = shouldSwap ? swapBetSource(raw) : { ...raw };
        }
      }
    }
  }
}

/**
 * 决胜局 promote：平台有 Map=0 全场盘、且尚无原生 Map=R 盘时可复制。
 * RAY（仅 final）、IA（有已结束 Map1/2 但无 Map3 获胜者）均适用；已有 Map=R 原生盘则跳过。
 */
function platformShouldPromoteFullToLiveRound(accByMap, platform, liveMap) {
  if (!accByMap.get(0)?.Sources?.[platform])
    return false;
  if (accByMap.get(liveMap)?.Sources?.[platform])
    return false;
  return true;
}

/** Map=0 裁剪前把各平台 Sources 最大赔写入 bet，供 Client_GetMatchDefaultOdds 初赔行 */
function preserveInitialOddsFromSources(bet) {
  if (!bet)
    return;
  let home = Number(bet.InitialHomeOdds) || 0;
  let away = Number(bet.InitialAwayOdds) || 0;
  for (const src of Object.values(bet.Sources || {})) {
    if (!src)
      continue;
    home = Math.max(home, Number(src.HomeOdds) || 0);
    away = Math.max(away, Number(src.AwayOdds) || 0);
  }
  if (home > 0)
    bet.InitialHomeOdds = home;
  if (away > 0)
    bet.InitialAwayOdds = away;
}

function betMapNumber(bet) {
  return Number(bet?.Map) || 0;
}

/** 各场 Bets 按 Map 升序（Map=0 全场盘在最前） */
function sortClientMatchBets(rows) {
  for (const row of rows || []) {
    if (!Array.isArray(row.Bets) || row.Bets.length < 2)
      continue;
    row.Bets.sort((a, b) => betMapNumber(a) - betMapNumber(b));
  }
}

/** 从各平台原始盘口合并 Map=0（DB 未 matchMerge 时 GetMatchs overlay 补全场行） */
function mergeMapZeroFromPlatformBets(row, matches, bets, timers, sourceFromBet) {
  const mergedSources = {};
  let canonBet = null;
  const reverse = row.Reverse || [];

  for (const [platform, sourceMatchId] of Object.entries(row.Matchs || {})) {
    const pm = findPlatformMatch(matches, platform, sourceMatchId);
    if (!pm)
      continue;
    const accRow = buildAccumulateRow(platform, pm, bets, timers, sourceFromBet);
    const accBet = (accRow.Bets || []).find(b => (b.Map ?? 0) === 0);
    const raw = accBet?.Sources?.[platform];
    if (!raw)
      continue;
    if (!canonBet)
      canonBet = accBet;
    mergedSources[platform] = reverse.includes(platform) ? swapBetSource(raw) : { ...raw };
  }

  if (!Object.keys(mergedSources).length)
    return null;

  const rowId = Number(row.ID) || 0;
  return {
    ...canonBet,
    ID: stableBetId(rowId, 0),
    MatchID: rowId,
    Map: 0,
    Sources: mergedSources,
  };
}

/**
 * 进行中时，从 platform_bets 补/刷新全场行。
 * GetMatchs overlay 会先用这里的最新、已按 Reverse 对齐的 Map=0，再做决胜局 promote。
 */
function ensureMapZeroForLiveRound(rows, matches, bets, timers, sourceFromBet) {
  if (!Array.isArray(rows) || !bets || !sourceFromBet || !matches)
    return;
  for (const row of rows) {
    const liveMap = Number(row.Round) || 0;
    if (liveMap <= 0)
      continue;

    const fullBet = mergeMapZeroFromPlatformBets(row, matches, bets, timers, sourceFromBet);
    if (!fullBet)
      continue;

    row.Bets = row.Bets || [];
    const existing = row.Bets.find(b => betMapNumber(b) === 0);
    if (existing) {
      existing.Sources = { ...(existing.Sources || {}), ...(fullBet.Sources || {}) };
    }
    else {
      row.Bets.push(fullBet);
    }
  }
}

function resolveRowBo(row, matches) {
  const direct = Number(row.BO) || 0;
  if (direct > 0)
    return direct;
  for (const [platform, sourceMatchId] of Object.entries(row.Matchs || {})) {
    const pm = findPlatformMatch(matches, platform, sourceMatchId);
    const n = Number(pm?.BO);
    if (n > 0)
      return n;
  }
  const maps = (row.Bets || []).map(b => Number(b.Map) || 0);
  return maps.length ? Math.max(...maps) : 0;
}

/**
 * 决胜局 Map 行 / 全场盘：由 matcher 写入 client_matches.Bets，浏览器只读展示。
 * 不在前端做 promote、锁盘、隐藏等二次判断；Map=0 / Map=R 是否出现、Sources 内容均以 GetMatchs 为准。
 */
function promoteFullMatchSourcesToLiveRound(rows, matches, bets, timers, sourceFromBet) {
  if (!bets || !sourceFromBet)
    return;
  for (const row of rows || []) {
    const liveMap = Number(row.Round) || 0;
    const bo = resolveRowBo(row, matches);
    if (liveMap <= 0 || bo <= 0 || liveMap !== bo)
      continue;

    const fullBet = (row.Bets || []).find(b => (b.Map ?? 0) === 0);
    if (!fullBet)
      continue;

    let liveBet = (row.Bets || []).find(b => (b.Map ?? 0) === liveMap);
    if (!liveBet) {
      const template = (row.Bets || []).find(b => (b.Map ?? 0) > 0) || fullBet;
      const clientId = Number(row.ID) || 0;
      liveBet = {
        ...template,
        ID:
          clientId > 0
            ? stableBetId(clientId, liveMap)
            : stablePendingBetId(row.MergeKey || row.Title || "row", liveMap),
        Map: liveMap,
        MatchID: row.ID ?? template.MatchID ?? 0,
        Name: `[地图${liveMap}]-单局-获胜`,
        Sources: {},
      };
      row.Bets = row.Bets || [];
      row.Bets.push(liveBet);
      row.Bets.sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
    }

    for (const [platform, sourceMatchId] of Object.entries(row.Matchs || {})) {
      const pm = findPlatformMatch(matches, platform, sourceMatchId);
      if (!pm)
        continue;
      const accRow = buildAccumulateRow(platform, pm, bets, timers, sourceFromBet);
      const accByMap = new Map((accRow.Bets || []).map(b => [b.Map ?? 0, b]));
      if (!platformShouldPromoteFullToLiveRound(accByMap, platform, liveMap))
        continue;

      let srcToCopy = fullBet.Sources?.[platform];
      if (!srcToCopy) {
        const rawFull = accByMap.get(0)?.Sources?.[platform];
        if (!rawFull)
          continue;
        // Map=0 因 ambiguous 省略时，决胜局仍从原始全场盘 promote（不 swap）
        srcToCopy = row.Reverse.includes(platform) ? swapBetSource(rawFull) : rawFull;
      }

      // fullBet.Sources 已由 reconcileClientMatchReverse 按 Title canonical 对齐，勿再 swap
      liveBet.Sources[platform] = { ...srcToCopy };
    }
  }
}

/**
 * 仅基于 client row 已有 Bets 做决胜局 promote（GetMatchs overlay，无 platform bets 时用）。
 */
function promoteFullMatchSourcesToLiveRoundInPlace(rows, matches = {}) {
  for (const row of rows || []) {
    const liveMap = Number(row.Round) || 0;
    const bo = resolveRowBo(row, matches);
    if (liveMap <= 0 || bo <= 0 || liveMap !== bo)
      continue;

    const fullBet = (row.Bets || []).find(b => (b.Map ?? 0) === 0);
    if (!fullBet?.Sources)
      continue;

    const accByMap = new Map((row.Bets || []).map(b => [b.Map ?? 0, b]));

    let liveBet = accByMap.get(liveMap);
    if (!liveBet) {
      const template = (row.Bets || []).find(b => (b.Map ?? 0) > 0) || fullBet;
      liveBet = {
        ...template,
        Map: liveMap,
        Name: `[地图${liveMap}]-单局-获胜`,
        Sources: {},
      };
      row.Bets = row.Bets || [];
      row.Bets.push(liveBet);
      row.Bets.sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
      accByMap.set(liveMap, liveBet);
    }

    for (const [platform, fullSrc] of Object.entries(fullBet.Sources)) {
      const liveSrc = accByMap.get(liveMap)?.Sources?.[platform];
      if (liveSrc && String(liveSrc.BetID || "") !== String(fullSrc.BetID || ""))
        continue;
      // client_matches 写入前已 reconcile；overlay 只复制，避免 Reverse 平台二次 swap
      liveBet.Sources[platform] = { ...fullSrc };
    }
  }
}

/**
 * 进行中（Round > 0）：Map=0 全场行 Sources 仅保留 OB 和 Polymarket。[A8 可证实 OB 部分；changmen 扩展 Polymarket]
 * 两者均无 Map=0 时保留该行但清空 Sources，Initial* 供 Web 初赔行展示（不展示平台实时盘）。
 * 须在 promoteFullMatchSourcesToLiveRound 之后调用（先复制到 Map=R，再裁剪 Map=0）。
 */
function trimMapZeroToObOnDeciderRound(rows) {
  for (const row of rows || []) {
    const liveMap = Number(row.Round) || 0;
    if (liveMap <= 0)
      continue;
    const fullBet = (row.Bets || []).find(b => (b.Map ?? 0) === 0);
    if (!fullBet)
      continue;
    preserveInitialOddsFromSources(fullBet);
    const kept = {};
    if (fullBet.Sources?.OB)
      kept.OB = fullBet.Sources.OB;
    if (fullBet.Sources?.Polymarket)
      kept.Polymarket = fullBet.Sources.Polymarket;
    fullBet.Sources = kept;
  }
  sortClientMatchBets(rows);
}

function refreshClientMatchSides(rows, matches, bets, timers, sourceFromBet, existingClientRows, platformSideOverrides) {
  refreshClientMatchCanonicalOrientation(rows, matches, existingClientRows);
  refreshClientMatchBetNames(rows);
  if (bets && sourceFromBet) {
    reconcileClientMatchReverse(rows, matches, bets, timers, sourceFromBet, platformSideOverrides);
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
    HomeGbTeamId: parseLockedGbTeamId(cm.home_gb_team_id) ?? undefined,
    AwayGbTeamId: parseLockedGbTeamId(cm.away_gb_team_id) ?? undefined,
  };
}

/** 分配 client id / 人工链接后：锁定主客 + 全量 reconcile + 决胜局后处理 */
function finalizeClientMatchListAfterLinks(mergedList, matches, bets, timers, sourceFromBet, existingClientRows, platformSideOverrides) {
  refreshClientMatchStartTimes(mergedList, matches);
  refreshClientMatchGames(mergedList, matches);
  refreshClientMatchSides(mergedList, matches, bets, timers, sourceFromBet, existingClientRows, platformSideOverrides);
  refreshClientMatchRoundsFromTimers(mergedList, timers);
  promoteFullMatchSourcesToLiveRound(mergedList, matches, bets, timers, sourceFromBet);
  ensureMapZeroForLiveRound(mergedList, matches, bets, timers, sourceFromBet);
  trimMapZeroToObOnDeciderRound(mergedList);
  applyObLiveRoundGate(mergedList, matches, timers);
  stripOrphanClientMatchPlatforms(mergedList, matches);
}

function platformMatchClientId(match) {
  const raw = match?.ClientMatchId ?? match?.client_match_id ?? match?.match_id;
  if (raw == null || raw === "")
    return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

/** 平台已挂在 Matchs 但 Bets 仍空 / 无该平台 Sources 时需重合并（防采集晚到后永久空盘） */
function clientRowNeedsPlatformBets(row, platform) {
  const betRows = row.Bets;
  if (!Array.isArray(betRows) || !betRows.length)
    return true;
  return !betRows.some(b => b.Sources?.[platform]);
}

/** 将 platform_matches.match_id / 内存 ClientMatchId 同步进 client row.Matchs（防回写漂移） */
function mergePlatformBetsIntoClientRow(target, targetId, platform, match, bets, timers, sourceFromBet) {
  const accRow = buildAccumulateRow(platform, match, bets, timers, sourceFromBet);
  const betByMap = new Map((target.Bets || []).map(b => [b.Map ?? 0, b]));
  for (const bet of accRow.Bets || []) {
    const map = bet.Map ?? 0;
    const existing = betByMap.get(map);
    if (existing) {
      Object.assign(existing.Sources, bet.Sources);
    }
    else {
      const nb = {
        ...bet,
        ID: stableBetId(targetId, map),
        MatchID: targetId,
      };
      target.Bets = target.Bets || [];
      target.Bets.push(nb);
      betByMap.set(map, nb);
    }
  }
}

function syncClientMatchsFromPlatformLinks(rows, matches, bets, timers, sourceFromBet) {
  if (!Array.isArray(rows) || !matches)
    return;
  for (const row of rows) {
    const clientId = Number(row.ID);
    if (!Number.isFinite(clientId))
      continue;
    for (const [platform, byId] of Object.entries(matches)) {
      if (!byId || typeof byId !== "object")
        continue;
      for (const match of Object.values(byId)) {
        if (!match?.SourceMatchID)
          continue;
        if (platformMatchClientId(match) !== clientId)
          continue;
        const sid = String(match.SourceMatchID);
        if (!row.Matchs)
          row.Matchs = {};
        const hadPlatform = row.Matchs[platform] === sid;
        row.Matchs[platform] = sid;
        if (!hadPlatform || clientRowNeedsPlatformBets(row, platform))
          mergePlatformBetsIntoClientRow(row, clientId, platform, match, bets, timers, sourceFromBet);
      }
    }
  }
}

/** RDS platform_matches.match_id 为准，补齐 client row.Matchs（防内存快照丢 ClientMatchId） */
function syncClientMatchsFromDbBindings(rows, bindingsByClientId, matches, bets, timers, sourceFromBet) {
  if (!Array.isArray(rows) || !bindingsByClientId?.size || !matches)
    return;
  for (const row of rows) {
    const clientId = Number(row.ID);
    if (!Number.isFinite(clientId))
      continue;
    const bindings = bindingsByClientId.get(clientId);
    if (!bindings?.length)
      continue;
    for (const { platform, source_match_id } of bindings) {
      const sid = String(source_match_id);
      const match = findPlatformMatch(matches, platform, sid);
      if (!match)
        continue;
      if (!row.Matchs)
        row.Matchs = {};
      const hadPlatform = row.Matchs[platform] === sid;
      row.Matchs[platform] = sid;
      if (!hadPlatform || clientRowNeedsPlatformBets(row, platform))
        mergePlatformBetsIntoClientRow(row, clientId, platform, match, bets, timers, sourceFromBet);
    }
  }
}

function applyManualMatchLinks(mergedList, matches, bets, timers, sourceFromBet, existingClientRows, platformSideOverrides, platformBindingsByClientId) {
  const links = collectManualLinks(matches);
  const linkedIds = new Set(links.map(l => Number(l.match_id)));
  if (platformBindingsByClientId?.size) {
    for (const cmId of platformBindingsByClientId.keys()) {
      const id = Number(cmId);
      if (Number.isFinite(id))
        linkedIds.add(id);
    }
  }

  if (links.length || linkedIds.size) {
    const targetById = new Map(mergedList.map(m => [Number(m.ID), m]));

    // 仅预填本次链接目标 id：晚到平台挂到已有 client 行，保留原 id / merge_key
    for (const cm of existingClientRows || []) {
      const id = Number(cm.id);
      if (!linkedIds.has(id) || !Number.isFinite(id) || targetById.has(id))
        continue;
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
              if (bet.Sources?.[link.platform])
                delete bet.Sources[link.platform];
            }
            row.Bets = row.Bets.filter(b => Object.keys(b.Sources || {}).length > 0);
          }
        }
      }
    }

    for (const link of links) {
      const targetId = Number(link.match_id);
      const match = findPlatformMatch(matches, link.platform, link.source_match_id);
      if (!match)
        continue;

      const target = targetById.get(targetId);

      if (!target) {
        const row = buildAccumulateRow(link.platform, match, bets, timers, sourceFromBet);
        row.ID = targetId;
        row.Bets = (row.Bets || []).map(b => ({
          ...b,
          ID: stableBetId(targetId, b.Map ?? 0),
          MatchID: targetId,
        }));
        mergedList.push(row);
        targetById.set(targetId, row);
        continue;
      }

      const alreadyLinked = target.Matchs?.[link.platform] === String(link.source_match_id);
      if (!alreadyLinked)
        target.Matchs[link.platform] = String(link.source_match_id);
      mergePlatformBetsIntoClientRow(target, targetId, link.platform, match, bets, timers, sourceFromBet);
    }
  }

  finalizeClientMatchListAfterLinks(mergedList, matches, bets, timers, sourceFromBet, existingClientRows, platformSideOverrides);
  syncClientMatchsFromPlatformLinks(mergedList, matches, bets, timers, sourceFromBet);
  syncClientMatchsFromDbBindings(mergedList, platformBindingsByClientId, matches, bets, timers, sourceFromBet);

  return filterMultiPlatformClientMatches(mergedList)
    .sort((a, b) => a.StartTime - b.StartTime);
}

function collectMergeEntries(matches, bets, timers, sourceFromBet) {
  const teamIndex = buildTeamEnrichIndex(matches);
  const manualKeys = collectManualLinkKeys(matches);
  const entries = [];

  for (const [provider, byId] of Object.entries(matches || {})) {
    if (!byId || typeof byId !== "object")
      continue;
    for (const match of Object.values(byId)) {
      if (!match?.SourceMatchID)
        continue;
      const rowKey = `${provider}:${String(match.SourceMatchID)}`;
      if (manualKeys.has(rowKey))
        continue;
      const startMs = normalizeEpochMs(match.StartTime);
      if (startMs > 0 && !a8StartTimeListAllowed(startMs))
        continue;

      let m = match;
      if (provider === "IM") {
        const block = bets[betKey("IM", match.SourceMatchID)];
        if (imMatchIsStale(match, block))
          continue;
        m = enrichImMatch(match, teamIndex);
        const unknownGame = !m.SourceGameID || String(m.SourceGameID).trim() === "unknown";
        if (!m.Home && !m.Away && unknownGame)
          continue;
      }

      const row = buildAccumulateRow(provider, m, bets, timers, sourceFromBet);
      row._provider = provider;
      const nativeGameId = String(m.SourceGameID || m.GameID || "");
      const gameCode = getGameCodeForPlatformId(provider, nativeGameId);
      const homeId = resolvePlatformTeamId(provider, m.HomeID, nativeGameId, gameCode);
      const awayId = resolvePlatformTeamId(provider, m.AwayID, nativeGameId, gameCode);

      entries.push({
        rowKey: `${provider}:${String(m.SourceMatchID)}`,
        row,
        home: String(m.Home || ""),
        away: String(m.Away || ""),
        gameId: row.GameID,
        gameCode,
        ctx: { provider, homeId, awayId },
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

  // 第一阶段：各平台 home_id / away_id 均已映射 → 按 gb_team_id 合并
  for (const entry of entries) {
    const ck = canonicalMatchKeyByIdOnly(entry.gameId, entry.home, entry.away, entry.gameCode, entry.ctx);
    if (!ck)
      continue;
    addToKeyGroup(idGroups, ck.key, {
      row: entry.row,
      reversed: ck.reversed,
      rowKey: entry.rowKey,
    });
  }
  // 仅当 ID 组达到最少平台数时才占用 idMatched；否则回退队名阶段，避免「ID 合并未成且无法队名合并」
  for (const group of idGroups.values()) {
    if (group.length < MIN_CLIENT_MATCH_PLATFORMS)
      continue;
    for (const { rowKey } of group) {
      if (rowKey)
        idMatched.add(rowKey);
    }
  }

  // 第二阶段：未进入第一阶段的场次 → 按归一化队名合并
  for (const entry of entries) {
    if (idMatched.has(entry.rowKey))
      continue;
    const ck = canonicalMatchKeyByName(entry.gameId, entry.home, entry.away);
    const mapKey = ck ? ck.mergeKey : entry.row.MergeKey;
    const reversed = ck ? ck.reversed : false;
    addToKeyGroup(nameGroups, mapKey, { row: entry.row, reversed, rowKey: entry.rowKey }, {
      strictTime: true,
    });
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
    if (!byId || typeof byId !== "object")
      continue;
    for (const match of Object.values(byId)) {
      if (!match?.SourceMatchID)
        continue;
      const startMs = normalizeEpochMs(match.StartTime);
      if (startMs > 0 && !a8StartTimeListAllowed(startMs))
        continue;
      if (provider === "IM") {
        const block = bets[betKey("IM", match.SourceMatchID)];
        if (imMatchIsStale(match, block))
          continue;
        const enriched = enrichImMatch(match, teamIndex);
        const unknownGame = !enriched.SourceGameID || String(enriched.SourceGameID).trim() === "unknown";
        if (!enriched.Home && !enriched.Away && unknownGame)
          continue;
        list.push(buildAccumulateRow(provider, enriched, bets, timers, sourceFromBet));
        continue;
      }
      list.push(buildAccumulateRow(provider, match, bets, timers, sourceFromBet));
    }
  }
  list.sort((a, b) => a.StartTime - b.StartTime);
  return collapseImClientRows(list);
}

/** matchMerge 写入前：去掉 platform_matches 已不存在的 Matchs / Sources（防内存僵尸平台） */
function stripOrphanClientMatchPlatforms(rows, platformMatches) {
  if (!Array.isArray(rows))
    return rows;
  for (const row of rows) {
    if (row?.Matchs && typeof row.Matchs === "object") {
      for (const [plat, srcId] of Object.entries({ ...row.Matchs })) {
        if (!findPlatformMatch(platformMatches, plat, srcId))
          delete row.Matchs[plat];
      }
    }
    if (!Array.isArray(row?.Bets))
      continue;
    for (const bet of row.Bets) {
      if (!bet?.Sources)
        continue;
      for (const plat of Object.keys(bet.Sources)) {
        const srcId = row.Matchs?.[plat];
        if (!srcId || !findPlatformMatch(platformMatches, plat, srcId))
          delete bet.Sources[plat];
      }
    }
    row.Bets = row.Bets.filter(b => Object.keys(b.Sources || {}).length > 0);
  }
  return rows;
}

/** 自动合并 matchs；主客对齐在 finalize（写库前全量 reconcile） */
function buildClientMatchList({ matches, bets, timers, sourceFromBet, platformSideOverrides }) {
  const normalized = normalizeMatchesShape(matches);
  const list = buildMatchListMerged(normalized, bets, timers, sourceFromBet);
  finalizeClientMatchListAfterLinks(list, normalized, bets, timers, sourceFromBet, null, platformSideOverrides);
  return filterMultiPlatformClientMatches(list);
}

export {
  applyManualMatchLinks,
  applyObLiveRoundGate,
  betMapNumber,
  buildAccumulateRow,
  buildClientMatchList,
  buildMatchListAccumulate,
  buildMatchListMerged,
  canonicalMatchKey,
  canonicalMatchKeyByIdOnly,
  canonicalMatchKeyByName,
  clientMatchPlatformCount,
  clientMatchRowToBuilt,
  collectManualLinks,
  ensureMapZeroForLiveRound,
  filterMultiPlatformClientMatches,
  liveRound,
  MERGE_MODE,
  MIN_CLIENT_MATCH_PLATFORMS,
  normalizeMatchesShape,
  normalizeTeam,
  pickCanonicalGbFromMatchs,
  pickCanonicalStartTime,
  promoteFullMatchSourcesToLiveRound,
  promoteFullMatchSourcesToLiveRoundInPlace,
  stripOrphanClientMatchPlatforms,
  syncClientMatchsFromDbBindings,
  syncClientMatchsFromPlatformLinks,
  PROVIDER_PRIORITY,
  reconcileClientMatchReverse,
  refreshClientMatchBetNames,
  refreshClientMatchCanonicalOrientation,
  refreshClientMatchRoundsFromTimers,
  refreshClientMatchSides,
  refreshClientMatchTitles,
  setTeamPlugin,
  sideAlignmentMode,
  sortClientMatchBets,
  stableId,
  swapBetSource,
  titleFromMatchs,
  trimMapZeroToObOnDeciderRound,
};
