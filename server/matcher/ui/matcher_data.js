import {
  fetchClientMatchesHidden,
  fetchClientMatchesHiddenCount,
  fetchAllEventBindings,
  fetchEventRegistryStats,
  fetchLatestClientMatchBuiltAt,
  loadTeamMapsForMatcher,
} from "@changmen/db";
import { normalizeMatchesShape } from "@changmen/match-engine";
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
import { enrichClientMatchesMergeMode, getTeamPlugin } from "./merge_mode.js";
import { enrichDashboardPairing } from "./pairing_ui.js";
import { buildRegistryDriftReport, summarizeRegistryDrift } from "./registry_drift.js";
import {
  attachObSpineHints,
  buildPlatformRowKeyMap,
  computeMergeKeyRecommendations,
} from "./recommendations.js";
import { fetchMatcherRdsSnapshot } from "../ops/rds_snapshot_cache.js";

function isPlatformMatchLinkedForRec(m, clientMatches) {
  const visibleClientMatches = filterVisibleClientMatches(clientMatches);
  if (
    m?.match_id != null
    && m.match_id !== ""
    && visibleClientMatches.some(cm => Number(cm.id) === Number(m.match_id))
  ) {
    return true;
  }
  return visibleClientMatches.some(
    cm => String(cm.matchs?.[m.platform] ?? "") === String(m.source_match_id),
  );
}

function filterVisibleClientMatches(clientMatches) {
  return (clientMatches || []).filter(cm => Object.keys(cm.matchs || {}).length >= 2);
}

function resolveVisibleClientMatchId(m, clientMatches) {
  const visibleClientMatches = filterVisibleClientMatches(clientMatches);
  if (m?.match_id != null && m.match_id !== "") {
    const directId = Number(m.match_id);
    if (visibleClientMatches.some(cm => Number(cm.id) === directId))
      return directId;
  }
  const cm = visibleClientMatches.find(
    row => String(row.matchs?.[m.platform] ?? "") === String(m.source_match_id),
  );
  return cm ? Number(cm.id) : null;
}

async function computeRecommendations(allMatches, clientMatches = []) {
  await getTeamPlugin();
  const platformKeyMap = buildPlatformRowKeyMap(allMatches);
  const withHints = attachObSpineHints(allMatches, clientMatches, platformKeyMap);
  return computeMergeKeyRecommendations(withHints, {
    isLinked: m => isPlatformMatchLinkedForRec(m, clientMatches),
  });
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
    filterVisibleClientMatches(clientMatches)
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
        binding_confidence: firstValue(m.BindingConfidence, m.binding_confidence),
        binding_source: firstValue(m.BindingSource, m.binding_source),
        binding_side_mode: firstValue(m.BindingSideMode, m.binding_side_mode),
        bound_at: firstValue(m.BoundAt, m.bound_at),
      });
    }
  }

  return rows.sort((a, b) => normalizeEpochMs(a.start_time) - normalizeEpochMs(b.start_time));
}

function summarizeMatcherDashboard(data) {
  const platformRows = Object.values(data?.platforms || {}).flat();
  const clientMatches = data?.clientMatches || [];
  const visibleClientMatches = filterVisibleClientMatches(clientMatches);
  const recKeys = new Set();
  for (const rec of data?.recommendations || []) {
    for (const m of rec.matches || [])
      recKeys.add(`${m.platform}:${m.source_match_id}`);
  }

  const byPlatform = {};
  const unmatchedSamples = [];
  const linkedSamples = [];
  let linked = 0;
  let unmatched = 0;
  let inRecommendation = 0;

  for (const m of platformRows) {
    if (!byPlatform[m.platform])
      byPlatform[m.platform] = { total: 0, linked: 0, unmatched: 0, inRecommendation: 0 };
    const bucket = byPlatform[m.platform];
    bucket.total++;
    const cmId = resolveVisibleClientMatchId(m, clientMatches);
    const recKey = `${m.platform}:${m.source_match_id}`;
    const recHit = recKeys.has(recKey);
    if (recHit) {
      inRecommendation++;
      bucket.inRecommendation++;
    }
    if (cmId != null) {
      linked++;
      bucket.linked++;
      if (linkedSamples.length < 8) {
        linkedSamples.push({
          platform: m.platform,
          source_match_id: m.source_match_id,
          client_match_id: cmId,
          home: m.home,
          away: m.away,
        });
      }
    }
    else {
      unmatched++;
      bucket.unmatched++;
      if (unmatchedSamples.length < 12) {
        unmatchedSamples.push({
          platform: m.platform,
          source_match_id: m.source_match_id,
          home: m.home,
          away: m.away,
          inRecommendation: recHit,
        });
      }
    }
  }

  return {
    platformMatches: platformRows.length,
    clientMatches: clientMatches.length,
    visibleClientMatches: visibleClientMatches.length,
    recommendations: data?.recommendations?.length || 0,
    linkedPlatformMatches: linked,
    unmatchedPlatformMatches: unmatched,
    inRecommendation,
    byPlatform,
    samples: {
      unmatched: unmatchedSamples,
      linked: linkedSamples,
    },
  };
}

async function fetchMatcherDashboard() {
  const [snapshot, hiddenClientMatchCount, eventRegistry, eventBindings] = await Promise.all([
    fetchMatcherRdsSnapshot(),
    fetchClientMatchesHiddenCount(),
    fetchEventRegistryStats(),
    fetchAllEventBindings(),
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
  const recommendations = await computeRecommendations(allMatches, clientMatchesNorm);

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

  const dashboard = {
    platforms: byPlatform,
    clientMatches,
    hiddenClientMatches: [],
    hiddenClientMatchCount,
    recommendations,
    teamMaps,
    updatedAt: Date.now(),
  };
  dashboard.debug = summarizeMatcherDashboard(dashboard);
  const enriched = enrichDashboardPairing(dashboard);
  if (eventRegistry) {
    enriched.debug.pairing = {
      ...(enriched.debug.pairing || {}),
      registry: eventRegistry,
    };
  }
  const registryDrift = buildRegistryDriftReport({
    clientMatches: enriched.clientMatches,
    platforms: enriched.platforms,
    eventBindings,
  });
  enriched.debug.registryDrift = summarizeRegistryDrift(registryDrift);
  enriched.registryDrift = registryDrift;
  return enriched;
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
  summarizeMatcherDashboard,
};
