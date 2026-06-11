"use strict";

const path = require("path");
require("../lib/env");
const express = require("express");
const { getMatcherSupabase } = require("../lib/supabase");
const { resolveUiGame } = require("../lib/game_ui");
const { normalizeTeam } = require("../engine");
const {
  readMatcherHeartbeat,
  isMatcherRunning,
  isPidAlive,
  clearMatcherHeartbeat,
  STALE_FACTOR,
} = require("../lib/heartbeat");
const {
  startMatcherProcess,
  stopMatcherProcess,
  isManagedByServer,
  getManagedMatcherPid,
} = require("./matcher_process");
const { enrichClientMatchesMergeMode } = require("./merge_mode");
const { logMatcherApiOk, logMatcherApiWarn, logMatcherApiErr } = require("./matcher_api_log");

const PORT = Number(process.env.MATCHER_UI_PORT || process.env.PIPEI_PORT || 4567);
const supabase = getMatcherSupabase();
if (!supabase) {
  console.warn("[matcher] Supabase 未配置，API 将不可用");
}

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

// 推荐组：同一游戏+时间桶+队名的全部平台场次（含已映射），只要还有未映射的仍留在队列
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
        game: g.game, t1: g.t1, t2: g.t2,
        platforms, startTime, timeDiffMs,
        confidence: Math.min(confidence, 1.0),
        matches: g.matches,
      };
    })
    .sort((a, b) => a.startTime - b.startTime);
}

function normalizePlatformIdStr(id) {
  if (id == null || id === "") return "";
  return String(id).trim();
}

function parseTeamsArrayRaw(teams) {
  if (Array.isArray(teams)) return teams;
  if (typeof teams === "string") {
    try { return JSON.parse(teams); } catch { return []; }
  }
  return [];
}

/** 从当前 platform_matches 收集 UI 会用到的 (platform, platform_id) */
function collectNeededTeamIds(allMatches) {
  const byPlatform = new Map();
  const add = (platform, pid) => {
    const p = String(platform || "").trim();
    const id = normalizePlatformIdStr(pid);
    if (!p || !id) return;
    if (!byPlatform.has(p)) byPlatform.set(p, new Set());
    byPlatform.get(p).add(id);
  };
  for (const m of allMatches || []) {
    add(m.platform, m.home_id);
    add(m.platform, m.away_id);
    for (const t of parseTeamsArrayRaw(m.teams)) {
      add(m.platform, t.TeamID ?? t.team_id ?? t.teamId ?? t.id);
    }
  }
  return byPlatform;
}

function mergeTeamMapRow(teamMaps, row) {
  const canonJoin = row.canonical_teams;
  const updatedBy = canonJoin && !Array.isArray(canonJoin) ? canonJoin.updated_by : null;
  const entry = {
    canonical_id: row.canonical_id != null ? String(row.canonical_id) : null,
    canonical_name: canonJoin && !Array.isArray(canonJoin) ? canonJoin.name : null,
    updated_by: updatedBy,
    platform_name: row.platform_name,
    game: row.game,
    pending: row.canonical_id == null,
  };
  const pid = normalizePlatformIdStr(row.platform_id);
  if (!pid) return;
  const idKey = `${row.platform}:${pid}`;
  const prev = teamMaps[idKey];
  if (!prev || (entry.canonical_id != null && prev.canonical_id == null)) {
    teamMaps[idKey] = entry;
  }
}

const TEAM_MAP_SELECT = "platform, platform_id, platform_name, canonical_id, game, canonical_teams(updated_by, name)";
const TEAM_MAP_BATCH = 200;

/** 按当前比赛涉及的 platform_id 精确加载 maps，避免 Supabase 默认 1000 行截断 */
async function loadTeamMapsForMatcher(allMatches) {
  const teamMaps = {};
  const neededByPlatform = collectNeededTeamIds(allMatches);
  for (const [platform, idSet] of neededByPlatform) {
    const ids = [...idSet];
    for (let i = 0; i < ids.length; i += TEAM_MAP_BATCH) {
      const batch = ids.slice(i, i + TEAM_MAP_BATCH);
      const { data, error } = await supabase
        .from("team_platform_maps")
        .select(TEAM_MAP_SELECT)
        .eq("platform", platform)
        .in("platform_id", batch);
      if (error) throw new Error(`team_platform_maps 查询失败: ${error.message}`);
      for (const row of data || []) mergeTeamMapRow(teamMaps, row);
    }
  }
  return teamMaps;
}

async function getMatcherStatus() {
  const now = Date.now();
  let heartbeat = readMatcherHeartbeat();
  if (heartbeat?.pid && !isPidAlive(heartbeat.pid)) {
    clearMatcherHeartbeat();
    heartbeat = null;
  }
  const intervalMs = heartbeat?.intervalMs || Number(process.env.MATCHER_INTERVAL_MS || 30_000);
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

  const canStop = processRunning;
  const canStart = !processRunning;

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
    canStop,
    canStart,
    // 兼容旧字段：running 仅表示 matcher 进程，不再用 built_at 推断
    running: processRunning,
    source: processRunning
      ? processSource
      : (dataFresh ? "data_only" : (heartbeat?.lastRun ? "heartbeat_stale" : (lastBuilt ? "data_stale" : "none"))),
    lastRun: processLastRun || lastBuilt || null,
    ageMs: processRunning ? processAgeMs : dataAgeMs,
  };
}

// ── Express ──────────────────────────────────────────────────────────────────
const app = express();

// POST /api/* 依赖 body-parser → iconv-lite；损坏时 GET 仍正常但 POST 会返回 HTML 错误页
try {
  require.resolve("iconv-lite/encodings");
} catch (err) {
  console.error(
    "[matcher] 依赖不完整（iconv-lite），POST API 不可用。请在 changmen/gamebet_matcher 执行: npm install"
  );
  console.error("[matcher]", err.message);
  process.exit(1);
}

app.use(express.json());

app.get("/api/link-preview", async (req, res) => {
  try {
    const { previewLinkAlignment } = require("../link");
    const result = await previewLinkAlignment(supabase, {
      platform: req.query.platform,
      sourceMatchId: req.query.sourceMatchId,
      clientMatchId: req.query.clientMatchId,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/link-platform-preview", async (req, res) => {
  try {
    const { previewLinkPlatformAlignment } = require("../link");
    const result = await previewLinkPlatformAlignment(supabase, {
      platform: req.query.platform,
      sourceMatchId: req.query.sourceMatchId,
      targetPlatform: req.query.targetPlatform,
      targetMatchId: req.query.targetMatchId,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/link-match", async (req, res) => {
  try {
    const { platform, sourceMatchId, clientMatchId, reversed } = req.body || {};
    const { linkPlatformToClientMatch } = require("../link");
    const result = await linkPlatformToClientMatch(supabase, {
      platform,
      sourceMatchId,
      clientMatchId,
      reversed: typeof reversed === "boolean" ? reversed : undefined,
    });
    logMatcherApiOk("/api/link-match", result);
    res.json(result);
  } catch (err) {
    logMatcherApiErr("/api/link-match", err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/link-platform-match", async (req, res) => {
  try {
    const { platform, sourceMatchId, targetPlatform, targetMatchId, reversed } = req.body || {};
    const { linkPlatformToPlatform } = require("../link");
    const result = await linkPlatformToPlatform(supabase, {
      platform,
      sourceMatchId,
      targetPlatform,
      targetMatchId,
      reversed: typeof reversed === "boolean" ? reversed : undefined,
    });
    logMatcherApiOk("/api/link-platform-match", result);
    res.json(result);
  } catch (err) {
    logMatcherApiErr("/api/link-platform-match", err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/link-team-preview", async (req, res) => {
  try {
    const { previewLinkPlatformTeams } = require("../link");
    const result = await previewLinkPlatformTeams(supabase, {
      a: {
        platform: req.query.platformA,
        platformId: req.query.platformIdA,
        platformName: req.query.platformNameA,
        gameCode: req.query.gameCode,
      },
      b: {
        platform: req.query.platformB,
        platformId: req.query.platformIdB,
        platformName: req.query.platformNameB,
        gameCode: req.query.gameCode,
      },
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/link-team", async (req, res) => {
  try {
    const { a, b } = req.body || {};
    const { linkPlatformTeams } = require("../link");
    const result = await linkPlatformTeams(supabase, { a, b });
    logMatcherApiOk("/api/link-team", result);
    res.json(result);
  } catch (err) {
    logMatcherApiErr("/api/link-team", err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/register-team-map", async (req, res) => {
  try {
    const { platform, platformId, platformName, gameCode } = req.body || {};
    const { registerTeamPlatformMap } = require("../link");
    const result = await registerTeamPlatformMap(supabase, {
      platform,
      platformId,
      platformName,
      gameCode,
    });
    logMatcherApiOk("/api/register-team-map", result);
    res.json(result);
  } catch (err) {
    const label = err.code === "already_registered" ? "skip" : "error";
    if (label === "skip") logMatcherApiWarn("/api/register-team-map", err, "skip");
    else logMatcherApiErr("/api/register-team-map", err);
    res.status(err.code === "already_registered" ? 409 : 400).json({
      ok: false,
      error: err.message,
      code: err.code || "register_failed",
    });
  }
});

app.delete("/api/client-match/:id", async (req, res) => {
  try {
    const { deleteClientMatch } = require("../ops/delete_client_match");
    const result = await deleteClientMatch(supabase, req.params.id);
    logMatcherApiOk("/api/client-match", result);
    res.json(result);
  } catch (err) {
    logMatcherApiErr("/api/client-match", err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/merge-preview", async (req, res) => {
  try {
    const { previewMergeClientMatches } = require("../ops/merge_client_matches");
    const result = await previewMergeClientMatches(supabase, {
      sourceClientMatchId: req.query.sourceClientMatchId,
      targetClientMatchId: req.query.targetClientMatchId,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/merge-client-matches", async (req, res) => {
  try {
    const { sourceClientMatchId, targetClientMatchId } = req.body || {};
    const { mergeClientMatches } = require("../ops/merge_client_matches");
    const result = await mergeClientMatches(supabase, {
      sourceClientMatchId,
      targetClientMatchId,
    });
    res.json(result);
  } catch (err) {
    console.error("[matcher] /api/merge-client-matches error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/data", async (req, res) => {
  try {
    const [pmRes, cmRes] = await Promise.all([
      supabase
        .from("platform_matches")
        .select("platform,source_match_id,source_game_id,start_time,home,home_id,away,away_id,bo,match_id,synced_at,teams")
        .order("start_time", { ascending: true }),
      supabase
        .from("client_matches")
        .select("id,title,game,game_id,start_time,bo,round,matchs,bets,built_at")
        .order("start_time", { ascending: true }),
    ]);

    const allMatches = pmRes.data || [];
    const clientMatchesRaw = cmRes.data || [];

    const recommendations = computeRecommendations(allMatches);

    // 给每条未匹配记录打上推荐标签
    const recByKey = new Map();
    for (const rec of recommendations) {
      for (const m of rec.matches) {
        recByKey.set(`${m.platform}:${m.source_match_id}`, {
          confidence: rec.confidence,
          partners: rec.platforms.filter((p) => p !== m.platform),
        });
      }
    }

    // 按平台分组，附加 game 解析和推荐信息
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

    res.json({ platforms: byPlatform, clientMatches, recommendations, teamMaps, updatedAt: Date.now() });
  } catch (err) {
    console.error("[matcher] /api/data error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/matcher-status", async (req, res) => {
  try {
    res.json(await getMatcherStatus());
  } catch (err) {
    res.status(500).json({ running: false, error: err.message });
  }
});

app.post("/api/matcher/start", async (req, res) => {
  try {
    const result = await startMatcherProcess();
    if (!result.ok) return res.status(409).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/matcher/stop", async (req, res) => {
  try {
    const result = await stopMatcherProcess();
    if (!result.ok) return res.status(409).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 调试：直接查 platform_matches 的平台分布和行数
app.get("/api/debug", async (req, res) => {
  const { data, error } = await supabase
    .from("platform_matches")
    .select("platform, source_match_id, start_time, home, away, synced_at");
  if (error) return res.json({ error: error.message });
  const summary = {};
  for (const r of data || []) {
    if (!summary[r.platform]) summary[r.platform] = { count: 0, sample: [] };
    summary[r.platform].count++;
    if (summary[r.platform].sample.length < 2) {
      summary[r.platform].sample.push({ home: r.home, away: r.away, start_time: r.start_time });
    }
  }
  res.json({ total: (data || []).length, byPlatform: summary });
});

app.use(express.static(path.join(__dirname, "public")));

app.use((err, req, res, _next) => {
  console.error("[matcher] request error:", err.message);
  if (!res.headersSent) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[matcher] http://localhost:${PORT}`);
  console.log(`[matcher] debug: http://localhost:${PORT}/api/debug`);
});
