import { MATCHER_INTERVAL_MS } from "../lib/config.js";
import { resolveUiGame } from "../lib/game_ui.js";
import { normalizeTeam } from "@changmen/match-engine";
import { normalizeEpochMs } from "@changmen/shared/time/match_time.mjs";
import {
  readMatcherHeartbeat,
  isMatcherRunning,
  isPidAlive,
  clearMatcherHeartbeat,
  STALE_FACTOR,
} from "../lib/heartbeat.js";
import {
  startMatcherProcess,
  stopMatcherProcess,
  isManagedByServer,
  getManagedMatcherPid,
} from "./matcher_process.js";
import { enrichClientMatchesMergeMode } from "./merge_mode.js";
import {
  loadTeamMapsForMatcher,
  fetchLatestClientMatchBuiltAt,
  fetchPlatformMatchesDashboard,
  fetchClientMatchesDashboard,
} from "@changmen/db";

function recommendationGroupKey(m) {
  const game = resolveUiGame(m.platform, m.source_game_id);
  if (!game) return null;
  const h = normalizeTeam(m.home);
  const a = normalizeTeam(m.away);
  if (!h || !a) return null;
  const bucket = Math.round(normalizeEpochMs(m.start_time) / (30 * 60 * 1000));
  const [t1, t2] = h <= a ? [h, a] : [a, h];
  return { key: `${game.code}:${bucket}:${t1}:${t2}`, game, t1, t2 };
}

function isPlatformMatchLinkedForRec(m, clientMatches) {
  if (m?.match_id != null && m.match_id !== "") return true;
  return (clientMatches || []).some(
    (cm) => String(cm.matchs?.[m.platform] ?? "") === String(m.source_match_id),
  );
}

function computeRecommendations(allMatches, clientMatches = []) {
  const groups = new Map();

  for (const m of allMatches) {
    const gk = recommendationGroupKey(m);
    if (!gk) continue;
    if (!groups.has(gk.key)) groups.set(gk.key, { game: gk.game, t1: gk.t1, t2: gk.t2, matches: [] });
    groups.get(gk.key).matches.push(m);
  }

  return [...groups.values()]
    .filter((g) => new Set(g.matches.map((m) => m.platform)).size >= 2)
    .filter((g) => g.matches.some((m) => !isPlatformMatchLinkedForRec(m, clientMatches)))
    .map((g) => {
      const platforms = [...new Set(g.matches.map((m) => m.platform))];
      const times = g.matches.map((m) => normalizeEpochMs(m.start_time)).filter((t) => t > 0);
      const startTime = times.length ? Math.min(...times) : 0;
      const timeDiffMs = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;
      let confidence = 0.6 + (platforms.length - 2) * 0.1;
      if (timeDiffMs < 5 * 60 * 1000) confidence += 0.2;
      else if (timeDiffMs < 15 * 60 * 1000) confidence += 0.1;
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
  let heartbeat = readMatcherHeartbeat();
  if (heartbeat?.pid && !isPidAlive(heartbeat.pid)) {
    clearMatcherHeartbeat();
    heartbeat = null;
  }
  const intervalMs = heartbeat?.intervalMs || MATCHER_INTERVAL_MS;
  const thresholdMs = intervalMs * STALE_FACTOR;

  let processRunning = false;
  let processSource = "none";
  let pid = null;
  let matchCount = heartbeat?.matchCount ?? null;
  let processLastRun = null;
  let processAgeMs = null;

  const managedPid = getManagedMatcherPid();
  if (managedPid) {
    processRunning = true;
    processSource = "managed";
    pid = managedPid;
    processLastRun = heartbeat?.lastRun || now;
    processAgeMs = heartbeat?.lastRun ? now - heartbeat.lastRun : 0;
  } else if (isMatcherRunning(heartbeat, now)) {
    processRunning = true;
    processSource = "heartbeat";
    pid = heartbeat.pid;
    matchCount = heartbeat.matchCount;
    processLastRun = heartbeat.lastRun;
    processAgeMs = now - heartbeat.lastRun;
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

async function fetchMatcherDashboard() {
  const [allMatchesRaw, clientMatchesRaw] = await Promise.all([
    fetchPlatformMatchesDashboard(),
    fetchClientMatchesDashboard(),
  ]);
  const allMatches = (allMatchesRaw || []).map(normalizeDashboardStartTime);
  const clientMatchesNorm = (clientMatchesRaw || []).map(normalizeDashboardStartTime);
  const recommendations = computeRecommendations(allMatches, clientMatchesNorm);

  const recByKey = new Map();
  for (const rec of recommendations) {
    for (const m of rec.matches) {
      recByKey.set(`${m.platform}:${m.source_match_id}`, {
        confidence: rec.confidence,
        partners: rec.platforms.filter((p) => p !== m.platform),
      });
    }
  }

  const byPlatform = {};
  for (const m of allMatches) {
    const enriched = {
      ...m,
      game: resolveUiGame(m.platform, m.source_game_id),
      rec: recByKey.get(`${m.platform}:${m.source_match_id}`) || null,
    };
    if (!byPlatform[m.platform]) byPlatform[m.platform] = [];
    byPlatform[m.platform].push(enriched);
  }

  const clientMatches = await enrichClientMatchesMergeMode(clientMatchesNorm, byPlatform);
  const teamMaps = await loadTeamMapsForMatcher(allMatches);

  return { platforms: byPlatform, clientMatches, recommendations, teamMaps, updatedAt: Date.now() };
}

export {
  computeRecommendations,
  getMatcherStatus,
  fetchMatcherDashboard,
};
