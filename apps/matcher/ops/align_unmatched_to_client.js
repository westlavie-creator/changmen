import { resolveClientGame, getGameCodeForPlatformId } from "../../../packages/shared/catalog/game_catalog.mjs";
import { normalizeEpochMs } from "../../../packages/shared/time/match_time.mjs";
import {
  canonicalMatchKeyByIdOnly,
  canonicalMatchKeyByName,
} from "../../../packages/match-engine/teams/team_key.js";
import { parseTitleTeams } from "../../../packages/match-engine/teams/match_utils.js";

/**
 * rebuild 前：将 match_id 为空的 platform_matches 优先挂到已有 client_matches。
 * 1) gb_team_id 键（match:id:…）
 * 2) 队名归一 + 开赛时间 ±15 分钟（match:name:…）
 * 命中后在内存写入 ClientMatchId，后续走 applyManualMatchLinks。
 */

/** 与 matcher 分组一致：开赛时间 ±15 分钟 */
const MERGE_START_TIME_TOLERANCE_MS = 15 * 60 * 1000;

function findPlatformMatch(matches, provider, sourceMatchId) {
  const sid = String(sourceMatchId);
  const byId = matches?.[provider];
  if (!byId) return null;
  if (byId[sid]) return byId[sid];
  return Object.values(byId).find((m) => String(m.SourceMatchID) === sid) || null;
}

function platformMatchLinked(match) {
  const cid = match?.ClientMatchId ?? match?.client_match_id ?? match?.match_id;
  return cid != null && cid !== "";
}

function startTimesCompatible(aMs, bMs) {
  const a = normalizeEpochMs(aMs);
  const b = normalizeEpochMs(bMs);
  if (!a || !b) return true;
  return Math.abs(a - b) <= MERGE_START_TIME_TOLERANCE_MS;
}

function resolveClientMatchIdKey(cm, matches) {
  const stored = String(cm.merge_key || "");
  if (stored.startsWith("match:id:")) return stored;

  for (const [platform, srcId] of Object.entries(cm.matchs || {})) {
    const m = findPlatformMatch(matches, platform, srcId);
    if (!m) continue;
    const { GameID } = resolveClientGame(platform, m.SourceGameID ?? m.GameID);
    const gameCode = getGameCodeForPlatformId(platform, m.SourceGameID ?? m.GameID);
    const ck = canonicalMatchKeyByIdOnly(
      GameID,
      m.Home,
      m.Away,
      gameCode,
      { provider: platform, homeId: m.HomeID, awayId: m.AwayID },
    );
    if (ck) return ck.key;
  }
  return null;
}

function resolveClientMatchNameKey(cm, matches) {
  const stored = String(cm.merge_key || "");
  if (stored.startsWith("match:name:")) return stored;

  for (const [platform, srcId] of Object.entries(cm.matchs || {})) {
    const m = findPlatformMatch(matches, platform, srcId);
    if (!m) continue;
    const { GameID } = resolveClientGame(platform, m.SourceGameID ?? m.GameID);
    const ck = canonicalMatchKeyByName(GameID, m.Home, m.Away);
    if (ck) return ck.key;
  }

  const teams = parseTitleTeams(cm.title || cm.Title || "");
  if (teams) {
    const gameId = String(cm.game_id ?? cm.GameID ?? "");
    const ck = canonicalMatchKeyByName(gameId, teams.home, teams.away);
    if (ck) return ck.key;
  }
  return null;
}

function buildClientMatchIndexes(clientRows, matches) {
  const byIdKey = new Map();
  const byNameKey = new Map();

  for (const cm of clientRows || []) {
    const idKey = resolveClientMatchIdKey(cm, matches);
    if (idKey) {
      if (!byIdKey.has(idKey)) byIdKey.set(idKey, []);
      byIdKey.get(idKey).push(cm);
    }
    const nameKey = resolveClientMatchNameKey(cm, matches);
    if (nameKey) {
      if (!byNameKey.has(nameKey)) byNameKey.set(nameKey, []);
      byNameKey.get(nameKey).push(cm);
    }
  }
  return { byIdKey, byNameKey };
}

function canAlignPlatformToClient(platform, sourceMatchId, cm) {
  const slot = cm.matchs?.[platform];
  if (slot != null && slot !== "" && String(slot) !== String(sourceMatchId)) return false;
  return true;
}

function pickBestClientMatch(candidates, platformStartMs) {
  if (!candidates?.length) return null;
  if (candidates.length === 1) return candidates[0];

  let best = candidates[0];
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const cm of candidates) {
    const cmStart = normalizeEpochMs(cm.start_time ?? cm.StartTime);
    const delta = cmStart && platformStartMs
      ? Math.abs(cmStart - platformStartMs)
      : Number.POSITIVE_INFINITY;
    if (delta < bestDelta || (delta === bestDelta && Number(cm.id) < Number(best.id))) {
      best = cm;
      bestDelta = delta;
    }
  }
  return best;
}

function assignClientMatchId(match, clientMatchId) {
  const id = Number(clientMatchId);
  match.ClientMatchId = id;
  match.client_match_id = id;
  match.match_id = id;
}

function alignOnePlatformMatch(match, platform, indexes, stats) {
  if (platformMatchLinked(match)) return;

  const sourceMatchId = String(match.SourceMatchID);
  const startMs = normalizeEpochMs(match.StartTime);
  const { GameID } = resolveClientGame(platform, match.SourceGameID ?? match.GameID);
  const gameCode = getGameCodeForPlatformId(platform, match.SourceGameID ?? match.GameID);
  const gameId = String(GameID || "");

  const idCk = canonicalMatchKeyByIdOnly(
    GameID,
    match.Home,
    match.Away,
    gameCode,
    { provider: platform, homeId: match.HomeID, awayId: match.AwayID },
  );
  if (idCk) {
    const candidates = (indexes.byIdKey.get(idCk.key) || [])
      .filter((cm) => String(cm.game_id ?? "") === gameId)
      .filter((cm) => canAlignPlatformToClient(platform, sourceMatchId, cm));
    const hit = pickBestClientMatch(candidates, startMs);
    if (hit) {
      assignClientMatchId(match, hit.id);
      stats.alignedById++;
      return;
    }
  }

  const nameCk = canonicalMatchKeyByName(GameID, match.Home, match.Away);
  if (!nameCk) return;

  const candidates = (indexes.byNameKey.get(nameCk.key) || [])
    .filter((cm) => String(cm.game_id ?? "") === gameId)
    .filter((cm) => startTimesCompatible(startMs, cm.start_time ?? cm.StartTime))
    .filter((cm) => canAlignPlatformToClient(platform, sourceMatchId, cm));
  const hit = pickBestClientMatch(candidates, startMs);
  if (!hit) return;

  assignClientMatchId(match, hit.id);
  stats.alignedByName++;
}

/**
 * @param {Record<string, Record<string, object>>} matches normalizeMatchesShape 产物
 * @param {object[]} clientRows fetchClientMatches 产物
 * @returns {{ alignedById: number, alignedByName: number }}
 */
function alignUnmatchedToClientMatches(matches, clientRows) {
  const stats = { alignedById: 0, alignedByName: 0 };
  if (!clientRows?.length || !matches) return stats;

  const indexes = buildClientMatchIndexes(clientRows, matches);

  for (const [platform, byId] of Object.entries(matches)) {
    if (!byId || typeof byId !== "object") continue;
    for (const match of Object.values(byId)) {
      if (!match?.SourceMatchID) continue;
      alignOnePlatformMatch(match, platform, indexes, stats);
    }
  }

  return stats;
}

export {
  MERGE_START_TIME_TOLERANCE_MS,
  alignUnmatchedToClientMatches,
  resolveClientMatchIdKey,
  resolveClientMatchNameKey,
};
