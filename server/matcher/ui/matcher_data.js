import {
  fetchClientMatchesHidden,
  fetchClientMatchesHiddenCount,
  fetchLatestClientMatchBuiltAt,
  loadTeamMapsForMatcher,
} from "@changmen/db";
import { normalizeMatchesShape, normalizeTeam } from "@changmen/match-engine";
import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { MATCHER_INTERVAL_MS } from "../lib/config.js";
import { resolveUiGame } from "../lib/game_ui.js";
import {
  isMatcherRunning,
  isPidAlive,
  readMatcherHeartbeat,
  sanitizeMatcherHeartbeat,
  STALE_FACTOR,
} from "../lib/heartbeat.js";
import {
  getEmbeddedMatcherState,
  getManagedMatcherPid,
  getPm2MatcherOnlinePid,
  isEmbeddedMatcherEnabled,
  isManagedByServer,
} from "./matcher_process.js";
import { enrichClientMatchesMergeMode } from "./merge_mode.js";
import { fetchMatcherRdsSnapshot } from "../ops/rds_snapshot_cache.js";

function recommendationGroupKey(m) {
  const game = resolveUiGame(m.platform, m.source_game_id);
  if (!game)
    return null;
  const h = normalizeTeam(m.home);
  const a = normalizeTeam(m.away);
  if (!h || !a)
    return null;
  const bucket = Math.round(normalizeEpochMs(m.start_time) / (30 * 60 * 1000));
  const [t1, t2] = h <= a ? [h, a] : [a, h];
  return { key: `${game.code}:${bucket}:${t1}:${t2}`, game, t1, t2 };
}

function isPlatformMatchLinkedForRec(m, clientMatches) {
  if (
    m?.match_id != null
    && m.match_id !== ""
    && (clientMatches || []).some(cm => Number(cm.id) === Number(m.match_id))
  ) {
    return true;
  }
  return (clientMatches || []).some(
    cm => String(cm.matchs?.[m.platform] ?? "") === String(m.source_match_id),
  );
}

function computeRecommendations(allMatches, clientMatches = []) {
  const groups = new Map();

  for (const m of allMatches) {
    const gk = recommendationGroupKey(m);
    if (!gk)
      continue;
    if (!groups.has(gk.key))
      groups.set(gk.key, { game: gk.game, t1: gk.t1, t2: gk.t2, matches: [] });
    groups.get(gk.key).matches.push(m);
  }

  return [...groups.values()]
    .filter(g => new Set(g.matches.map(m => m.platform)).size >= 2)
    .filter(g => g.matches.some(m => !isPlatformMatchLinkedForRec(m, clientMatches)))
    .map((g) => {
      const platforms = [...new Set(g.matches.map(m => m.platform))];
      const times = g.matches.map(m => normalizeEpochMs(m.start_time)).filter(t => t > 0);
      const startTime = times.length ? Math.min(...times) : 0;
      const timeDiffMs = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;
      let confidence = 0.6 + (platforms.length - 2) * 0.1;
      if (timeDiffMs < 5 * 60 * 1000)
        confidence += 0.2;
      else if (timeDiffMs < 15 * 60 * 1000)
        confidence += 0.1;
      return {
        game: g.game,
        t1: g.t1,
        t2: g.t2,
        platforms,
        startTime,
        timeDiffMs,
        confidence: Math.min(confidence, 1.0),
        matches: g.matches,
      };
    })
    .sort((a, b) => a.startTime - b.startTime);
}

async function getMatcherStatus() {
  const now = Date.now();
  const heartbeat = sanitizeMatcherHeartbeat(readMatcherHeartbeat());
  const intervalMs = heartbeat?.intervalMs || MATCHER_INTERVAL_MS;
  const thresholdMs = intervalMs * STALE_FACTOR;

  let processRunning = false;
  let processSource = "none";
  let pid = null;
  let matchCount = heartbeat?.matchCount ?? null;
  let processLastRun = null;
  let processAgeMs = null;

  const embeddedState = getEmbeddedMatcherState();
  if (embeddedState.running) {
    processRunning = true;
    processSource = "embedded";
    pid = embeddedState.pid;
    processLastRun = heartbeat?.lastRun || now;
    processAgeMs = heartbeat?.lastRun ? now - heartbeat.lastRun : 0;
  }
  else if (getManagedMatcherPid()) {
    const managedPid = getManagedMatcherPid();
    processRunning = true;
    processSource = "managed";
    pid = managedPid;
    processLastRun = heartbeat?.lastRun || now;
    processAgeMs = heartbeat?.lastRun ? now - heartbeat.lastRun : 0;
  }
  else if (isMatcherRunning(heartbeat, now)) {
    processRunning = true;
    processSource = "heartbeat";
    pid = heartbeat.pid;
    matchCount = heartbeat.matchCount;
    processLastRun = heartbeat.lastRun;
    processAgeMs = now - heartbeat.lastRun;
  }
  else {
    const pm2Pid = await getPm2MatcherOnlinePid();
    if (pm2Pid && isPidAlive(pm2Pid)) {
      processRunning = true;
      processSource = "pm2";
      pid = pm2Pid;
      processLastRun = heartbeat?.lastRun || null;
      processAgeMs = processLastRun ? now - processLastRun : null;
      matchCount = heartbeat?.matchCount ?? null;
    }
  }

  const lastBuilt = await fetchLatestClientMatchBuiltAt();
  const dataAgeMs = lastBuilt ? now - lastBuilt : null;
  const dataFresh = !!(lastBuilt && dataAgeMs <= thresholdMs);

  return {
    processRunning,
    processSource,
    dataFresh,
    lastBuiltAt: lastBuilt || null,
    dataAgeMs,
    processLastRun,
    processAgeMs,
    intervalMs,
    matchCount,
    pid,
    matcherMode: isEmbeddedMatcherEnabled() ? "embedded" : "standalone",
    managedByServer: isManagedByServer(),
    canStop: processRunning,
    canStart: !processRunning,
    running: processRunning,
    source: processRunning
      ? processSource
      : dataFresh
        ? "data_only"
        : heartbeat?.lastRun
          ? "heartbeat_stale"
          : lastBuilt
            ? "data_stale"
            : "none",
    lastRun: processLastRun || lastBuilt || null,
    ageMs: processRunning ? processAgeMs : dataAgeMs,
  };
}

function normalizeDashboardStartTime(row) {
  return { ...row, start_time: normalizeEpochMs(row.start_time) };
}

function firstValue(...values) {
  return values.find(v => v != null && v !== "");
}

function dashboardRowsFromSnapshot(matchesRaw, clientMatches) {
  const activeClientIds = new Set(
    (clientMatches || [])
      .map(cm => Number(cm.id))
      .filter(Number.isFinite),
  );
  const normalized = normalizeMatchesShape(matchesRaw);
  const rows = [];

  for (const [platform, byId] of Object.entries(normalized || {})) {
    for (const m of Object.values(byId || {})) {
      const sourceMatchId = firstValue(m.SourceMatchID, m.source_match_id);
      if (sourceMatchId == null)
        continue;
      const rawMatchId = firstValue(m.ClientMatchId, m.client_match_id, m.match_id);
      const matchId = rawMatchId != null && activeClientIds.has(Number(rawMatchId))
        ? Number(rawMatchId)
        : null;
      rows.push({
        platform,
        source_match_id: String(sourceMatchId),
        source_game_id: firstValue(m.SourceGameID, m.source_game_id, ""),
        start_time: Number(firstValue(m.StartTime, m.start_time, 0)) || 0,
        home: firstValue(m.Home, m.home, ""),
        home_id: firstValue(m.HomeID, m.home_id, ""),
        away: firstValue(m.Away, m.away, ""),
        away_id: firstValue(m.AwayID, m.away_id, ""),
        bo: Number(firstValue(m.BO, m.bo, 0)) || 0,
        match_id: matchId,
        synced_at: Number(firstValue(m.savedAt, m.synced_at, 0)) || 0,
        teams: Array.isArray(m.Teams) ? m.Teams : (Array.isArray(m.teams) ? m.teams : []),
      });
    }
  }

  return rows.sort((a, b) => normalizeEpochMs(a.start_time) - normalizeEpochMs(b.start_time));
}

async function fetchMatcherDashboard() {
  const [snapshot, hiddenClientMatchCount] = await Promise.all([
    fetchMatcherRdsSnapshot(),
    fetchClientMatchesHiddenCount(),
  ]);
  const clientMatchesRaw = snapshot.clientRows || [];
  const allMatchesRaw = dashboardRowsFromSnapshot(snapshot.matchesRaw, clientMatchesRaw);

  const clientMatchesNorm = (clientMatchesRaw || []).map(normalizeDashboardStartTime);

  const gameByPlatformMatch = new Map();
  for (const cm of clientMatchesNorm) {
    const code = typeof cm.game === "string" ? cm.game : cm.game?.code;
    if (!code)
      continue;
    for (const [plat, srcId] of Object.entries(cm.matchs || {})) {
      gameByPlatformMatch.set(`${plat}:${srcId}`, code);
    }
  }

  const allMatches = (allMatchesRaw || []).map((row) => {
    const normalized = normalizeDashboardStartTime(row);
    const gameFromCm = gameByPlatformMatch.get(`${normalized.platform}:${normalized.source_match_id}`);
    const uiGame
      = resolveUiGame(normalized.platform, normalized.source_game_id)
        || (gameFromCm ? { code: gameFromCm, name: gameFromCm } : null);
    return { ...normalized, game: uiGame };
  });
  const recommendations = computeRecommendations(allMatches, clientMatchesNorm);

  const recByKey = new Map();
  for (const rec of recommendations) {
    for (const m of rec.matches) {
      recByKey.set(`${m.platform}:${m.source_match_id}`, {
        confidence: rec.confidence,
        partners: rec.platforms.filter(p => p !== m.platform),
      });
    }
  }

  const byPlatform = {};
  for (const m of allMatches) {
    const enriched = {
      ...m,
      game: m.game || resolveUiGame(m.platform, m.source_game_id),
      rec: recByKey.get(`${m.platform}:${m.source_match_id}`) || null,
    };
    if (!byPlatform[m.platform])
      byPlatform[m.platform] = [];
    byPlatform[m.platform].push(enriched);
  }

  const teamMaps = await loadTeamMapsForMatcher(allMatches);
  const clientMatches = await enrichClientMatchesMergeMode(clientMatchesNorm, byPlatform, teamMaps);

  return {
    platforms: byPlatform,
    clientMatches,
    hiddenClientMatches: [],
    hiddenClientMatchCount,
    recommendations,
    teamMaps,
    updatedAt: Date.now(),
  };
}

async function fetchMatcherHiddenClientMatches() {
  const [rows, count] = await Promise.all([
    fetchClientMatchesHidden(),
    fetchClientMatchesHiddenCount(),
  ]);
  return {
    hiddenClientMatches: (rows || []).map(normalizeDashboardStartTime),
    hiddenClientMatchCount: count,
    updatedAt: Date.now(),
  };
}

export {
  computeRecommendations,
  fetchMatcherDashboard,
  fetchMatcherHiddenClientMatches,
  getMatcherStatus,
};
