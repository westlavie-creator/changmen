import { MATCHER_INTERVAL_MS } from "../lib/config.js";
import { resolveUiGame } from "../lib/game_ui.js";
import { normalizeTeam } from "../../../packages/match-engine/index.js";
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
import { loadTeamMapsForMatcher } from "../../../packages/shared/db/index.js";

function recommendationGroupKey(m) {
  const game = resolveUiGame(m.platform, m.source_game_id);
  if (!game) return null;
  const h = normalizeTeam(m.home);
  const a = normalizeTeam(m.away);
  if (!h || !a) return null;
  const bucket = Math.round((m.start_time || 0) / (30 * 60 * 1000));
  const [t1, t2] = h <= a ? [h, a] : [a, h];
  return { key: `${game.code}:${bucket}:${t1}:${t2}`, game, t1, t2 };
}

function computeRecommendations(allMatches) {
  const groups = new Map();

  for (const m of allMatches) {
    const gk = recommendationGroupKey(m);
    if (!gk) continue;
    if (!groups.has(gk.key)) groups.set(gk.key, { game: gk.game, t1: gk.t1, t2: gk.t2, matches: [] });
    groups.get(gk.key).matches.push(m);
  }

  return [...groups.values()]
    .filter((g) => new Set(g.matches.map((m) => m.platform)).size >= 2)
    .filter((g) => g.matches.some((m) => !m.match_id))
    .map((g) => {
      const platforms = [...new Set(g.matches.map((m) => m.platform))];
      const times = g.matches.map((m) => m.start_time || 0).filter(Boolean);
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

async function getMatcherStatus(supabase) {
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

  const { data } = await supabase
    .from("client_matches")
    .select("built_at")
    .order("built_at", { ascending: false })
    .limit(1);
  const lastBuilt = data?.[0]?.built_at || 0;
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

async function fetchMatcherDashboard(supabase) {
  const [pmRes, cmRes] = await Promise.all([
    supabase
      .from("platform_matches")
      .select(
        "platform,source_match_id,source_game_id,start_time,home,home_id,away,away_id,bo,match_id,synced_at,teams",
      )
      .order("start_time", { ascending: true }),
    supabase
      .from("client_matches")
      .select("id,title,game,game_id,start_time,bo,round,matchs,bets,built_at")
      .order("start_time", { ascending: true }),
  ]);

  const allMatches = pmRes.data || [];
  const clientMatchesRaw = cmRes.data || [];
  const recommendations = computeRecommendations(allMatches);

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

  const clientMatches = await enrichClientMatchesMergeMode(clientMatchesRaw, byPlatform);
  const teamMaps = await loadTeamMapsForMatcher(allMatches);

  return { platforms: byPlatform, clientMatches, recommendations, teamMaps, updatedAt: Date.now() };
}

export {
  computeRecommendations,
  getMatcherStatus,
  fetchMatcherDashboard,
};
