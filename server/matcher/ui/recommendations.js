/**
 * 与 matchMerge 同源的推荐分组（canonical id / name 键 + 时间窗）。
 */

import {
  canonicalMatchKeyByIdOnly,
  canonicalMatchKeyByName,
  startTimesCompatible,
  startTimesCompatibleStrict,
} from "@changmen/match-engine";
import { getGameCodeForPlatformId, resolveClientGame } from "@changmen/shared/catalog/game_catalog";
import { resolvePlatformTeamId } from "@changmen/shared/catalog/pb_team_platform_id";
import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { resolveUiGame } from "../lib/game_ui.js";

function mergeKeyForRow(m) {
  const game = m.game || resolveUiGame(m.platform, m.source_game_id);
  if (!game?.code)
    return null;

  const sourceGameId = m.source_game_id || "";
  const { GameID } = resolveClientGame(m.platform, sourceGameId);
  const gameCode = game.code || getGameCodeForPlatformId(m.platform, sourceGameId);
  const homeId = resolvePlatformTeamId(m.platform, m.home_id, sourceGameId, gameCode);
  const awayId = resolvePlatformTeamId(m.platform, m.away_id, sourceGameId, gameCode);

  const idCk = canonicalMatchKeyByIdOnly(
    GameID,
    m.home,
    m.away,
    gameCode,
    { provider: m.platform, homeId, awayId },
  );
  if (idCk) {
    return {
      baseKey: idCk.key,
      mapKey: idCk.key,
      basis: "id",
      game,
      strictTime: false,
    };
  }

  const nameCk = canonicalMatchKeyByName(GameID, m.home, m.away);
  if (!nameCk)
    return null;

  const startMs = normalizeEpochMs(m.start_time);
  const mapKey = startMs
    ? `${nameCk.mergeKey}@${startMs}`
    : `${nameCk.mergeKey}@notime:${m.platform}:${m.source_match_id}`;
  return {
    baseKey: nameCk.mergeKey,
    mapKey,
    basis: "name",
    game,
    strictTime: true,
    startMs,
  };
}

function findCompatibleSubgroupKey(groups, baseKey, startMs, strictTime, soloKey) {
  const st = normalizeEpochMs(startMs);
  if (strictTime && !st)
    return `${baseKey}@notime:${soloKey}`;

  for (const [key, bucket] of groups) {
    if (key !== baseKey && !key.startsWith(`${baseKey}@`))
      continue;
    const refStart = bucket.matches[0]?.start_time ?? 0;
    const compatible = strictTime
      ? startTimesCompatibleStrict(st, refStart)
      : startTimesCompatible(st, refStart);
    if (compatible)
      return key;
  }

  if (st)
    return `${baseKey}@${st}`;
  return `${baseKey}@notime:${soloKey}`;
}

function addToSubgroup(groups, entry) {
  const mk = mergeKeyForRow(entry);
  if (!mk)
    return;

  const soloKey = `${entry.platform}:${entry.source_match_id}`;
  let resolvedKey = mk.mapKey;
  if (mk.basis === "name") {
    resolvedKey = findCompatibleSubgroupKey(
      groups,
      mk.baseKey,
      mk.startMs,
      mk.strictTime,
      soloKey,
    );
  }

  if (!groups.has(resolvedKey)) {
    groups.set(resolvedKey, { game: mk.game, basis: mk.basis, matches: [] });
  }
  groups.get(resolvedKey).matches.push(entry);
}

function confidenceForGroup(group) {
  const platforms = [...new Set(group.matches.map(m => m.platform))];
  const times = group.matches.map(m => normalizeEpochMs(m.start_time)).filter(t => t > 0);
  const timeDiffMs = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;

  let confidence = group.basis === "id" ? 0.85 : 0.65;
  confidence += (platforms.length - 2) * 0.08;
  if (timeDiffMs < 5 * 60 * 1000)
    confidence += 0.15;
  else if (timeDiffMs < 30 * 60 * 1000)
    confidence += 0.05;

  if (group.matches.some(m => m.ob_spine_target != null))
    confidence = Math.min(1, confidence + 0.1);

  return Math.min(confidence, 1);
}

/**
 * @param {object[]} allMatches dashboard 平台行
 * @param {{ isLinked: (m: object) => boolean }} helpers
 */
function computeMergeKeyRecommendations(allMatches, helpers) {
  const isLinked = helpers?.isLinked ?? (() => false);
  const groups = new Map();

  for (const m of allMatches || [])
    addToSubgroup(groups, m);

  const out = [];
  for (const [, group] of groups) {
    const platforms = [...new Set(group.matches.map(m => m.platform))];
    if (platforms.length < 2)
      continue;
    if (!group.matches.some(m => !isLinked(m)))
      continue;

    const times = group.matches.map(m => normalizeEpochMs(m.start_time)).filter(t => t > 0);

    out.push({
      game: group.game,
      t1: group.matches[0]?.home || "",
      t2: group.matches[0]?.away || "",
      platforms,
      startTime: times.length ? Math.min(...times) : 0,
      timeDiffMs: times.length > 1 ? Math.max(...times) - Math.min(...times) : 0,
      confidence: confidenceForGroup(group),
      merge_basis: group.basis,
      matches: group.matches,
    });
  }

  return out.sort((a, b) => a.startTime - b.startTime);
}

function canAlignSlot(cm, platform, sourceMatchId) {
  const slot = cm.matchs?.[platform];
  if (slot != null && slot !== "" && String(slot) !== String(sourceMatchId))
    return false;
  return true;
}

/**
 * 未匹配平台 → 带 OB 轴且槽位空闲的 client_match（运维 OB 挂接提示）。
 */
function attachObSpineHints(allMatches, clientMatches, platformRowsByKey) {
  const spineRows = (clientMatches || []).filter(
    cm => cm.matchs?.OB != null && cm.matchs.OB !== "",
  );
  if (!spineRows.length)
    return allMatches;

  return (allMatches || []).map((m) => {
    if (m.match_id != null)
      return m;

    const startMs = normalizeEpochMs(m.start_time);
    const mk = mergeKeyForRow(m);
    if (!mk)
      return m;

    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const cm of spineRows) {
      if (!canAlignSlot(cm, m.platform, m.source_match_id))
        continue;

      const obSrc = String(cm.matchs.OB);
      const obPm = platformRowsByKey?.get(`OB:${obSrc}`);
      const obRow = obPm
        ? { ...obPm, platform: "OB", game: mk.game }
        : {
          platform: "OB",
          source_game_id: cm.game_id || "",
          home: parseTitleSide(cm.title, 0),
          away: parseTitleSide(cm.title, 1),
          home_id: "",
          away_id: "",
          game: mk.game,
          start_time: cm.start_time,
        };

      const cmMk = mergeKeyForRow(obRow);
      if (!cmMk || cmMk.baseKey !== mk.baseKey)
        continue;

      if (mk.strictTime) {
        const cmStart = normalizeEpochMs(cm.start_time);
        if (!startTimesCompatibleStrict(startMs, cmStart))
          continue;
      }

      const cmStart = normalizeEpochMs(cm.start_time);
      const delta = cmStart && startMs ? Math.abs(cmStart - startMs) : Number.POSITIVE_INFINITY;
      if (delta < bestScore) {
        best = cm;
        bestScore = delta;
      }
    }

    if (!best)
      return m;
    return {
      ...m,
      ob_spine_target: Number(best.id),
      ob_spine_anchor: `OB:${best.matchs.OB}`,
    };
  });
}

function parseTitleSide(title, idx) {
  const parts = String(title || "").split(/\s+vs\s+/i);
  return (parts[idx] || "").trim();
}

function buildPlatformRowKeyMap(allMatches) {
  const map = new Map();
  for (const m of allMatches || []) {
    map.set(`${m.platform}:${m.source_match_id}`, m);
  }
  return map;
}

export {
  attachObSpineHints,
  buildPlatformRowKeyMap,
  computeMergeKeyRecommendations,
  mergeKeyForRow,
};
