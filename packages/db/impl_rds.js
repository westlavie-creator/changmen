/**
 * impl_rds — 数据读写全走 RDS（PostgreSQL + JWT 鉴权）。
 *
 * 命名约定：
 *   fetch*  — async 读取，返回数据或 null/[]
 *   write*  — fire-and-forget 写入，不阻塞调用方
 *   upsert* — async 写入，需要确认结果
 */

import crypto from "node:crypto";
import { getDbMode } from "./db_mode.js";
import { getPgPool as getSharedPgPool } from "./pg_pool.js";
import { hasDatabaseUrlConfig } from "./resolve_database_url.js";

const JWT_SECRET = process.env.JWT_SECRET || "";

function parseJwtTtl(raw, fallbackSec) {
  const s = String(raw || "").trim();
  if (!s) return fallbackSec;
  const m = s.match(/^(\d+)([smhd])?$/i);
  if (!m) return fallbackSec;
  const n = Number(m[1]);
  const u = (m[2] || "s").toLowerCase();
  const mult = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (mult[u] || 1);
}

const JWT_ACCESS_TTL_SEC = parseJwtTtl(process.env.JWT_ACCESS_TTL, 7 * 86400);
const JWT_REFRESH_TTL_SEC = parseJwtTtl(process.env.JWT_REFRESH_TTL, 30 * 86400);

const _mode = getDbMode();

function getPgPool() {
  return getSharedPgPool(`GAMEBET_DB_SCRIPT=${_mode.script}`);
}


function signJwt(payload, secret, ttlSec) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSec };
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}

function verifyJwt(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  try {
    const p = String(token || "").split(".")[1];
    if (!p) return null;
    return JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** fire-and-forget 写入 RDS */
function _writeRds(fn, label = "") {
  const pool = getPgPool();
  if (!pool) return;
  Promise.resolve()
    .then(() => fn(pool))
    .catch((err) => console.warn(`[rds${label ? ":" + label : ""}]`, err.message));
}

function _jsonb(val, fallback) {
  if (val == null) return JSON.stringify(fallback ?? null);
  return JSON.stringify(val);
}

async function _rdsUpsertPlatformMatches(pool, rows) {
  if (!rows.length) return;
  const client = await pool.connect();
  const sql = `
    INSERT INTO platform_matches (
      platform, source_match_id, source_game_id, start_time,
      home_id, home, away_id, away, bo, teams, synced_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
    ON CONFLICT (platform, source_match_id) DO UPDATE SET
      source_game_id = EXCLUDED.source_game_id,
      start_time = EXCLUDED.start_time,
      home_id = EXCLUDED.home_id,
      home = EXCLUDED.home,
      away_id = EXCLUDED.away_id,
      away = EXCLUDED.away,
      bo = EXCLUDED.bo,
      teams = EXCLUDED.teams,
      synced_at = EXCLUDED.synced_at
  `;
  try {
    await client.query("BEGIN");
    for (const r of rows) {
      await client.query(sql, [
        r.platform,
        r.source_match_id,
        r.source_game_id,
        r.start_time,
        r.home_id,
        r.home,
        r.away_id,
        r.away,
        r.bo,
        JSON.stringify(Array.isArray(r.teams) ? r.teams : []),
        r.synced_at,
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function _rdsUpsertPlatformBets(exec, rows) {
  if (!rows.length) return;
  const sql = `
    INSERT INTO platform_bets (
      platform, source_match_id, source_bet_id, map, bet_name,
      home_odds, away_odds, is_locked, source_home_id, source_away_id, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (platform, source_match_id, source_bet_id) DO UPDATE SET
      map = EXCLUDED.map,
      bet_name = EXCLUDED.bet_name,
      home_odds = EXCLUDED.home_odds,
      away_odds = EXCLUDED.away_odds,
      is_locked = EXCLUDED.is_locked,
      source_home_id = EXCLUDED.source_home_id,
      source_away_id = EXCLUDED.source_away_id,
      updated_at = EXCLUDED.updated_at
  `;
  for (const r of rows) {
    await exec.query(sql, [
      r.platform,
      r.source_match_id,
      r.source_bet_id,
      r.map,
      r.bet_name,
      r.home_odds,
      r.away_odds,
      r.is_locked,
      r.source_home_id,
      r.source_away_id,
      r.updated_at,
    ]);
  }
}

async function _rdsReplacePlatformBets(pool, platform, matchId, rows) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM platform_bets WHERE platform = $1 AND source_match_id = $2",
      [String(platform), String(matchId)],
    );
    await _rdsUpsertPlatformBets(client, rows);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function _rdsUpsertLiveTimers(pool, rows) {
  if (!rows.length) return;
  const client = await pool.connect();
  const sql = `
    INSERT INTO live_timers (platform, source_match_id, round, round_start, updated_at)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (platform, source_match_id) DO UPDATE SET
      round = EXCLUDED.round,
      round_start = EXCLUDED.round_start,
      updated_at = EXCLUDED.updated_at
  `;
  try {
    await client.query("BEGIN");
    for (const r of rows) {
      await client.query(sql, [
        r.platform,
        r.source_match_id,
        r.round,
        r.round_start,
        r.updated_at,
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function _rdsUpsertClientMatches(pool, dedupedRows, toDelete) {
  const client = await pool.connect();
  const sql = `
    INSERT INTO client_matches (
      id, merge_key, title, game, game_id, start_time, bo, round, round_start,
      matchs, bets, reverse, built_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13)
    ON CONFLICT (id) DO UPDATE SET
      merge_key = EXCLUDED.merge_key,
      title = EXCLUDED.title,
      game = EXCLUDED.game,
      game_id = EXCLUDED.game_id,
      start_time = EXCLUDED.start_time,
      bo = EXCLUDED.bo,
      round = EXCLUDED.round,
      round_start = EXCLUDED.round_start,
      matchs = EXCLUDED.matchs,
      bets = EXCLUDED.bets,
      reverse = EXCLUDED.reverse,
      built_at = EXCLUDED.built_at
  `;
  try {
    await client.query("BEGIN");
    for (const r of dedupedRows) {
      await client.query(sql, [
        Number(r.id),
        r.merge_key != null ? String(r.merge_key) : null,
        String(r.title || ""),
        r.game != null ? String(r.game) : null,
        r.game_id != null ? String(r.game_id) : null,
        r.start_time != null ? Number(r.start_time) : null,
        r.bo != null ? Number(r.bo) : null,
        r.round != null ? Number(r.round) : null,
        Number(r.round_start) || 0,
        _jsonb(r.matchs, {}),
        _jsonb(r.bets, []),
        _jsonb(r.reverse, []),
        Number(r.built_at),
      ]);
    }
    if (toDelete.length) {
      await client.query("DELETE FROM client_matches WHERE id = ANY($1::bigint[])", [toDelete]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function _rdsFetchPlatformMatches(pool) {
  const { rows } = await pool.query(
    `SELECT platform, source_match_id, source_game_id, start_time, home, home_id, away, away_id, bo, teams, match_id
     FROM platform_matches`,
  );
  const byPlatform = {};
  for (const r of rows) {
    if (!byPlatform[r.platform]) byPlatform[r.platform] = [];
    byPlatform[r.platform].push({
      Type: r.platform,
      SourceMatchID: r.source_match_id,
      SourceGameID: r.source_game_id ?? "",
      StartTime: r.start_time ?? 0,
      Home: r.home ?? "",
      HomeID: r.home_id ?? "",
      Away: r.away ?? "",
      AwayID: r.away_id ?? "",
      BO: r.bo ?? 0,
      Teams: Array.isArray(r.teams) ? r.teams : [],
      ClientMatchId: r.match_id != null ? Number(r.match_id) : null,
    });
  }
  return byPlatform;
}

async function _rdsFetchPlatformBets(pool) {
  const { rows } = await pool.query(
    `SELECT platform, source_bet_id, source_match_id, map, bet_name,
            source_home_id, source_away_id, home_odds, away_odds, is_locked
     FROM platform_bets`,
  );
  const byKey = {};
  for (const r of rows) {
    const key = `${r.platform}:${r.source_match_id}`;
    if (!byKey[key]) byKey[key] = { provider: r.platform, matchId: r.source_match_id, bets: [], savedAt: 0 };
    byKey[key].bets.push({
      SourceBetID: r.source_bet_id,
      BetName: r.bet_name ?? "",
      Map: r.map ?? 0,
      SourceHomeID: r.source_home_id ?? "",
      SourceAwayID: r.source_away_id ?? "",
      HomeOdds: r.home_odds ?? 0,
      AwayOdds: r.away_odds ?? 0,
      Status: r.is_locked ? "Locked" : "Normal",
    });
  }
  return byKey;
}

async function _rdsFetchLiveTimers(pool) {
  const { rows } = await pool.query(
    "SELECT platform, source_match_id, round, round_start FROM live_timers",
  );
  const byPlatform = {};
  for (const r of rows) {
    if (!byPlatform[r.platform]) byPlatform[r.platform] = { provider: r.platform, timer: [], savedAt: 0 };
    byPlatform[r.platform].timer.push({
      MatchID: r.source_match_id,
      Round: r.round ?? 0,
      StartTime: r.round_start ?? 0,
    });
  }
  return byPlatform;
}

async function _rdsFetchClientMatches(pool) {
  const { rows } = await pool.query("SELECT * FROM client_matches ORDER BY start_time ASC NULLS LAST");
  return rows;
}

async function _rdsFetchClientMatchesMeta(pool) {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count, COALESCE(MAX(built_at), 0)::bigint AS built_at FROM client_matches",
  );
  const row = rows[0] || {};
  return { builtAt: Number(row.built_at) || 0, count: Number(row.count) || 0 };
}

async function _rdsInitLastWrittenIds(pool) {
  const { rows } = await pool.query("SELECT id FROM client_matches");
  _lastWrittenIds = new Set(rows.map((r) => Number(r.id)));
  console.log(`[rds] 已从 client_matches 加载 ${_lastWrittenIds.size} 条 id`);
}

async function _rdsSetPlatformMatchId(pool, platform, sourceMatchId, matchId, onlyIfNull) {
  const sql = onlyIfNull
    ? `UPDATE platform_matches SET match_id = $3
       WHERE platform = $1 AND source_match_id = $2 AND match_id IS NULL`
    : `UPDATE platform_matches SET match_id = $3
       WHERE platform = $1 AND source_match_id = $2`;
  const res = await pool.query(sql, [String(platform), String(sourceMatchId), Number(matchId)]);
  return res.rowCount ?? 0;
}

/**
 * 回写 platform_matches.match_id（RDS）。
 * @returns {Promise<{ updated: boolean, skipped: boolean, conflict: boolean }>}
 */
async function setPlatformMatchId(platform, sourceMatchId, matchId, opts = {}) {
  const onlyIfNull = opts.onlyIfNull !== false && opts.force !== true;
  const plat = String(platform);
  const srcId = String(sourceMatchId);
  const cmId = Number(matchId);
  if (!Number.isFinite(cmId)) return { updated: false, skipped: true, conflict: false };

  const pool = getPgPool();
  if (!pool) return { updated: false, skipped: true, conflict: false };

  const { rows } = await pool.query(
    "SELECT match_id FROM platform_matches WHERE platform = $1 AND source_match_id = $2",
    [plat, srcId],
  );
  if (!rows.length) return { updated: false, skipped: true, conflict: false };

  const cur =
    rows[0].match_id != null && rows[0].match_id !== "" ? Number(rows[0].match_id) : null;
  if (cur === cmId) return { updated: false, skipped: true, conflict: false };
  if (cur != null && cur !== cmId && onlyIfNull) return { updated: false, skipped: false, conflict: true };

  const n = await _rdsSetPlatformMatchId(pool, plat, srcId, cmId, onlyIfNull);
  return { updated: n > 0, skipped: n === 0, conflict: false };
}

// ── profiles ──────────────────────────────────────────────────────────

/** 拉取所有 profiles 到内存（启动时调用） */
async function fetchProfiles(_sessionClient) {
  const pool = getPgPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query("SELECT * FROM profiles");
    return rows || [];
  } catch (err) {
    console.error("[rds] fetchProfiles 失败:", err.message);
    return [];
  }
}

/** 按 uid 读单个 profile */
async function fetchProfileById(uid) {
  const pool = getPgPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query("SELECT * FROM profiles WHERE id = $1", [String(uid)]);
    return rows[0] || null;
  } catch (err) {
    console.warn("[rds] fetchProfileById:", err.message);
    return null;
  }
}

/** fire-and-forget：更新 profile 字段 */
function writeProfile(uid, patch) {
  const now = Date.now();
  const pool = getPgPool();
  if (!pool) return;
  const jsonbCols = new Set(["accounts", "betting_config", "collect_config", "preferences"]);
  const keys = Object.keys(patch).filter((k) => k !== "updated_at");
  if (!keys.length) return;
  const sets = [];
  const vals = [String(uid)];
  for (const k of keys) {
    vals.push(jsonbCols.has(k) ? _jsonb(patch[k], patch[k]) : patch[k]);
    sets.push(jsonbCols.has(k) ? `${k} = $${vals.length}::jsonb` : `${k} = $${vals.length}`);
  }
  vals.push(now);
  sets.push(`updated_at = $${vals.length}`);
  Promise.resolve()
    .then(() => pool.query(`UPDATE profiles SET ${sets.join(", ")} WHERE id = $1`, vals))
    .catch((err) => console.warn("[rds:profiles]", err.message));
}

/** 在 profiles 表中创建新用户行（首次登录触发器未执行时的兜底） */
async function insertProfile(uid, data) {
  const pool = getPgPool();
  if (!pool) return false;
  const rdsArgs = [
    String(data.id || uid),
    String(data.user_name || ""),
    JSON.stringify(data.accounts ?? []),
    JSON.stringify(data.betting_config ?? {}),
    JSON.stringify(data.collect_config ?? {}),
    JSON.stringify(data.preferences ?? {}),
    Number(data.created_at) || Date.now(),
    Number(data.updated_at) || Date.now(),
  ];
  try {
    await pool.query(
      `INSERT INTO profiles (id, user_name, accounts, betting_config, collect_config, preferences, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      rdsArgs,
    );
    return true;
  } catch (err) {
    console.warn("[rds] insertProfile:", err.message);
    return false;
  }
}

// ── accounts ──────────────────────────────────────────────────────────

/** fire-and-forget：替换用户账号列表 */
function writeAccounts(uid, accounts) {
  writeProfile(uid, { accounts })
}

// ── client_matches ────────────────────────────────────────────────────

// 上次写入的 id 集合，用于 diff-based 删除，避免每次 rebuild 全表扫描
let _lastWrittenIds = new Set()

function _prepareClientMatchWrite(rows) {
  if (!Array.isArray(rows)) return null
  const seen = new Map()
  for (const row of rows) seen.set(Number(row.id), row)
  const dedupedRows = [...seen.values()]
  const activeIds = new Set(dedupedRows.map((r) => Number(r.id)))
  const toDelete = [..._lastWrittenIds].filter((id) => !activeIds.has(id))
  _lastWrittenIds = activeIds
  return { dedupedRows, toDelete }
}

/** fire-and-forget：upsert 客户端比赛列表，只删离开活跃列表的行 */
function writeClientMatches(rows) {
  const prepared = _prepareClientMatchWrite(rows)
  if (!prepared) return
  const { dedupedRows, toDelete } = prepared
  _writeRds((pool) => _rdsUpsertClientMatches(pool, dedupedRows, toDelete), "client_matches")
}

/** await 写入完成（matcher / rebuild 使用，避免前端读到上一版） */
async function writeClientMatchesAsync(rows) {
  const prepared = _prepareClientMatchWrite(rows)
  if (!prepared) return
  const { dedupedRows, toDelete } = prepared
  const pool = getPgPool()
  if (!pool) {
    writeClientMatches(rows)
    return
  }
  await _rdsUpsertClientMatches(pool, dedupedRows, toDelete)
}

/** 启动时预填 _lastWrittenIds，使差量删除能覆盖上次遗留行 */
async function initLastWrittenIds() {
  const pool = getPgPool()
  if (!pool) return
  try {
    await _rdsInitLastWrittenIds(pool)
  } catch (err) {
    console.warn('[rds] initLastWrittenIds 失败:', err.message)
  }
}

/** 启动时清空 client_matches */
async function clearClientMatchesOnStartup() {
  const pool = getPgPool();
  if (!pool) return;
  try {
    await pool.query("DELETE FROM client_matches WHERE id != 0");
  } catch (err) {
    console.warn("[rds] clearClientMatchesOnStartup 失败:", err.message);
  }
}

/**
 * 轻量探测 client_matches 是否变化（供 backend 快照缓存失效，避免每次 Client_GetMatchs 全表 SELECT *）。
 * @returns {Promise<{ builtAt: number, count: number }|null>} 失败时 null
 */
async function fetchClientMatchesMeta() {
  const pool = getPgPool()
  if (!pool) return null
  try {
    return await _rdsFetchClientMatchesMeta(pool)
  } catch (err) {
    console.warn('[rds] fetchClientMatchesMeta 失败:', err.message)
    return null
  }
}

/**
 * 从 RDS 读取 client_matches，按 start_time 升序排列。
 * @returns {Promise<object[]|null>} 成功时返回数组（可为空）；失败/未配置时返回 null。
 */
async function fetchClientMatches() {
  const pool = getPgPool()
  if (!pool) return null
  try {
    return await _rdsFetchClientMatches(pool)
  } catch (err) {
    console.warn('[rds] fetchClientMatches 失败:', err.message)
    return null
  }
}

// ── platform_matches ──────────────────────────────────────────────────

function mapPlatformMatchRows(provider, matchs) {
  const now = Date.now();
  return matchs.map((m) => ({
    platform: String(provider),
    source_match_id: String(m.SourceMatchID),
    source_game_id: m.SourceGameID != null ? String(m.SourceGameID) : null,
    start_time: Number(m.StartTime) || null,
    home_id: m.HomeID != null ? String(m.HomeID) : null,
    home: String(m.Home || ""),
    away_id: m.AwayID != null ? String(m.AwayID) : null,
    away: String(m.Away || ""),
    bo: m.BO != null ? Number(m.BO) : null,
    teams: Array.isArray(m.Teams) ? m.Teams : [],
    synced_at: now,
  }));
}

/** fire-and-forget：upsert 平台原始比赛列表，同时删除该平台已结束的旧行 */
function writePlatformMatches(provider, matchs) {
  if (!Array.isArray(matchs) || !matchs.length) return
  const rows = mapPlatformMatchRows(provider, matchs)
  _writeRds((pool) => _rdsUpsertPlatformMatches(pool, rows), "platform_matches")
}

/** 启动时读取 platform_matches，按平台分组，返回可直接传给 store.saveMatches 的格式 */
async function fetchPlatformMatches() {
  const pool = getPgPool()
  if (!pool) return {}
  try {
    return await _rdsFetchPlatformMatches(pool)
  } catch (err) {
    console.warn('[rds] fetchPlatformMatches 失败:', err.message)
    return {}
  }
}

/** 从 RDS 读取 platform_bets，重组为 store._bets 格式 */
async function fetchPlatformBets() {
  const pool = getPgPool()
  if (!pool) return {}
  try {
    return await _rdsFetchPlatformBets(pool)
  } catch (err) {
    console.warn('[rds] fetchPlatformBets 失败:', err.message)
    return {}
  }
}

/** 从 RDS 读取 live_timers，重组为 store._timers 格式 */
async function fetchLiveTimers() {
  const pool = getPgPool()
  if (!pool) return {}
  try {
    return await _rdsFetchLiveTimers(pool)
  } catch (err) {
    console.warn('[rds] fetchLiveTimers 失败:', err.message)
    return {}
  }
}

// ── platform_bets ─────────────────────────────────────────────────────

/** SaveBet 12 字段 → platform_bets 行（A8 协议无 group_name） */
function mapSaveBetRows(provider, matchId, bets) {
  const now = Date.now()
  const rawRows = (bets || [])
    .filter((b) => b && b.SourceBetID != null && !String(b.BetName ?? '').includes('+'))
    .map((b) => ({
      platform:        String(provider),
      source_bet_id:   String(b.SourceBetID),
      source_match_id: String(matchId),
      map:             Number(b.Map ?? 0),
      bet_name:        String(b.BetName || ''),
      source_home_id:  String(b.SourceHomeID ?? b.source_home_id ?? '') || null,
      source_away_id:  String(b.SourceAwayID ?? b.source_away_id ?? '') || null,
      home_odds:       Number(b.HomeOdds) || 0,
      away_odds:       Number(b.AwayOdds) || 0,
      is_locked:       b.Status !== 'Normal',
      updated_at:      now,
    }))
  const seen = new Map()
  for (const row of rawRows) seen.set(`${row.source_match_id}:${row.source_bet_id}`, row)
  return [...seen.values()]
}

/** fire-and-forget：upsert 平台盘口赔率（空数组刷新 updated_at 时用） */
function writePlatformBets(provider, matchId, bets) {
  const rows = mapSaveBetRows(provider, matchId, bets)
  if (!rows.length) return
  _writeRds((pool) => _rdsUpsertPlatformBets(pool, rows), "platform_bets")
}

/** [A8 可证实] 每场 saveBets 为完整快照：先删该场旧行再 upsert */
function replacePlatformBetsForMatch(provider, matchId, bets) {
  const rows = mapSaveBetRows(provider, matchId, bets)
  if (!rows.length) return
  const plat = String(provider)
  const mid = String(matchId)
  _writeRds((pool) => _rdsReplacePlatformBets(pool, plat, mid, rows), "platform_bets")
}

// ── live_timers ───────────────────────────────────────────────────────

/** fire-and-forget：upsert 比赛计时器（只保最新） */
function writeLiveTimers(provider, timer) {
  if (!Array.isArray(timer) || !timer.length) return
  const now = Date.now()
  const rawRows = timer
    .filter((t) => t && t.MatchID != null)
    .map((t) => ({
      platform:        String(provider),
      source_match_id: String(t.MatchID),
      round:           Number(t.Round) || 0,
      round_start:     Number(t.StartTime) || 0,
      updated_at:      now,
    }))
  if (!rawRows.length) return
  const seen = new Map()
  for (const row of rawRows) seen.set(row.source_match_id, row)
  const rows = [...seen.values()]
  _writeRds((pool) => _rdsUpsertLiveTimers(pool, rows), "live_timers")
}

// ── orders ────────────────────────────────────────────────────────────

async function _rdsUpsertOrders(pool, rows) {
  if (!rows?.length) return;
  const sql = `
    INSERT INTO orders (
      user_id, player_id, order_id, link, provider, match, bet, item,
      odds, bet_money, money, status, create_at, raw
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
    ON CONFLICT (user_id, order_id, player_id) DO UPDATE SET
      link = EXCLUDED.link,
      provider = EXCLUDED.provider,
      match = EXCLUDED.match,
      bet = EXCLUDED.bet,
      item = EXCLUDED.item,
      odds = EXCLUDED.odds,
      bet_money = EXCLUDED.bet_money,
      money = EXCLUDED.money,
      status = EXCLUDED.status,
      create_at = EXCLUDED.create_at,
      raw = EXCLUDED.raw
  `;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const o of rows) {
      await client.query(sql, [
        String(o.user_id),
        Number(o.player_id),
        String(o.order_id),
        o.link != null ? Number(o.link) : null,
        o.provider != null ? String(o.provider) : null,
        o.match != null ? String(o.match) : null,
        o.bet != null ? String(o.bet) : null,
        o.item != null ? String(o.item) : null,
        Number(o.odds) || 0,
        Number(o.bet_money) || 0,
        Number(o.money) || 0,
        String(o.status || "None"),
        Number(o.create_at),
        _jsonb(o.raw, {}),
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** YYYY-MM → 本地时区当月 [start, end) 毫秒 */
function localMonthBounds(monthKey) {
  const parts = String(monthKey || '').split('-').map(Number)
  const y = parts[0]
  const m = parts[1]
  if (!y || !m) {
    const now = new Date()
    return localMonthBounds(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  }
  const monthStart = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime()
  const monthEnd = new Date(y, m, 1, 0, 0, 0, 0).getTime()
  return { monthStart, monthEnd }
}

/** YYYY-MM-DD → 本地时区当日 [start, end) 毫秒 */
function localDayBounds(dateKey) {
  const parts = String(dateKey || '').split('-').map(Number)
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
    const now = Date.now()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { dayStart: start.getTime(), dayEnd: start.getTime() + 86400000 }
  }
  const [y, m, d] = parts
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
  const dayEnd = new Date(y, m - 1, d + 1, 0, 0, 0, 0).getTime()
  return { dayStart, dayEnd }
}

/** 按日期读取订单（userId 隔离） */
async function fetchOrdersByDate(date, userId) {
  const { dayStart, dayEnd } = localDayBounds(date)
  const pool = getPgPool()
  if (!pool || !userId) return []
  try {
    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE user_id = $1 AND create_at >= $2 AND create_at < $3
       ORDER BY create_at DESC`,
      [String(userId), dayStart, dayEnd],
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchOrdersByDate:', err.message)
    return []
  }
}

/** 按 playerId 读取订单 */
async function fetchOrdersByPlayer(playerId, userId) {
  const pool = getPgPool()
  if (!pool || !userId) return []
  try {
    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE user_id = $1 AND player_id = $2 ORDER BY create_at DESC`,
      [String(userId), Number(playerId)],
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchOrdersByPlayer:', err.message)
    return []
  }
}

/** upsert 订单列表 */
async function upsertOrders(rows) {
  if (!rows?.length) return false
  const pool = getPgPool()
  if (!pool) return false
  try {
    await _rdsUpsertOrders(pool, rows)
    return true
  } catch (err) {
    console.warn('[rds] upsertOrders:', err.message)
    return false
  }
}

/** 管理端：全量 profiles 摘要 */
async function fetchProfilesAdmin() {
  const pool = getPgPool()
  if (!pool) return []
  try {
    const { rows } = await pool.query(
      `SELECT id, user_name, accounts, betting_config, collect_config, preferences, created_at, updated_at
       FROM profiles ORDER BY user_name ASC`,
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchProfilesAdmin:', err.message)
    return []
  }
}

/** 管理端：当日订单汇总 */
async function fetchOrdersAdminStats(dateKey) {
  const { dayStart, dayEnd } = localDayBounds(dateKey)
  const pool = getPgPool()
  if (!pool) return { count: 0, money: 0, betMoney: 0 }
  try {
    const { rows } = await pool.query(
      `SELECT money, bet_money, status FROM orders WHERE create_at >= $1 AND create_at < $2`,
      [dayStart, dayEnd],
    )
    let count = 0
    let money = 0
    let betMoney = 0
    for (const o of rows || []) {
      if (String(o.status || '') === 'Reject') continue
      count += 1
      money += Number(o.money) || 0
      betMoney += Number(o.bet_money) || 0
    }
    return { count, money, betMoney }
  } catch (err) {
    console.warn('[rds] fetchOrdersAdminStats:', err.message)
    return { count: 0, money: 0, betMoney: 0 }
  }
}

/** 管理端：分页订单 */
async function fetchOrdersAdminPage({ dateKey, userId, provider, pageIndex, pageSize }) {
  const { dayStart, dayEnd } = localDayBounds(dateKey)
  const from = (Math.max(1, pageIndex) - 1) * pageSize
  const pool = getPgPool()
  if (!pool) return { rows: [], total: 0 }
  try {
    const params = [dayStart, dayEnd]
    let where = "create_at >= $1 AND create_at < $2"
    if (userId) {
      params.push(String(userId))
      where += ` AND user_id = $${params.length}`
    }
    if (provider) {
      params.push(String(provider))
      where += ` AND provider = $${params.length}`
    }
    const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM orders WHERE ${where}`, params)
    const total = countRes.rows[0]?.n ?? 0
    params.push(pageSize, from)
    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE ${where} ORDER BY create_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )
    return { rows: rows || [], total }
  } catch (err) {
    console.warn('[rds] fetchOrdersAdminPage:', err.message)
    return { rows: [], total: 0 }
  }
}

/** 管理端：当日全量订单（对阵矩阵，上限 5000 条） */
async function fetchOrdersAdminAll({ dateKey, provider, limit = 5000 }) {
  const { dayStart, dayEnd } = localDayBounds(dateKey)
  const cap = Math.min(5000, Math.max(1, Number(limit) || 5000))
  const pool = getPgPool()
  if (!pool) return []
  try {
    const params = [dayStart, dayEnd]
    let where = "create_at >= $1 AND create_at < $2"
    if (provider) {
      params.push(String(provider))
      where += ` AND provider = $${params.length}`
    }
    params.push(cap)
    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE ${where} ORDER BY create_at ASC LIMIT $${params.length}`,
      params,
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchOrdersAdminAll:', err.message)
    return []
  }
}

/** 月报：读取指定月份全部订单聚合字段（全站，非按 user 隔离） */
async function fetchOrdersForMonthAggregate(monthKey) {
  const { monthStart, monthEnd } = localMonthBounds(monthKey)
  const pool = getPgPool()
  if (!pool) return []
  try {
    const { rows } = await pool.query(
      `SELECT create_at, money, bet_money, status FROM orders WHERE create_at >= $1 AND create_at < $2`,
      [monthStart, monthEnd],
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchOrdersForMonthAggregate:', err.message)
    return []
  }
}

/** 排行榜：按本地自然日读取订单盈利聚合字段 */
async function fetchOrdersForProfitAggregate(dateKey) {
  const { dayStart, dayEnd } = localDayBounds(dateKey)
  const pool = getPgPool()
  if (!pool) return []
  try {
    const { rows } = await pool.query(
      `SELECT user_id, money, bet_money, status FROM orders WHERE create_at >= $1 AND create_at < $2`,
      [dayStart, dayEnd],
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchOrdersForProfitAggregate:', err.message)
    return []
  }
}

// ── money_logs ────────────────────────────────────────────────────────

async function fetchMoneyLogsByPlayer(playerId, userId) {
  const pid = Number(playerId)
  if (!Number.isFinite(pid)) return []
  const pool = getPgPool()
  if (!pool) return []
  try {
    const params = [pid]
    let where = 'player_id = $1'
    if (userId) {
      params.push(String(userId))
      where += ` AND user_id = $${params.length}`
    }
    const { rows } = await pool.query(
      `SELECT id, user_id, player_id, type, money, currency, description, is_auto, create_at, updated_at
       FROM money_logs WHERE ${where} ORDER BY create_at DESC`,
      params,
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchMoneyLogsByPlayer:', err.message)
    return []
  }
}

async function fetchMoneyLogById(logId, userId) {
  const id = Number(logId)
  if (!Number.isFinite(id) || id <= 0) return null
  const pool = getPgPool()
  if (!pool) return null
  try {
    const params = [id]
    let where = 'id = $1'
    if (userId) {
      params.push(String(userId))
      where += ` AND user_id = $${params.length}`
    }
    const { rows } = await pool.query(
      `SELECT id, user_id, player_id, type, money, currency, description, is_auto, create_at, updated_at
       FROM money_logs WHERE ${where} LIMIT 1`,
      params,
    )
    return rows?.[0] ?? null
  } catch (err) {
    console.warn('[rds] fetchMoneyLogById:', err.message)
    return null
  }
}

async function fetchAllMoneyLogs() {
  const pool = getPgPool()
  if (!pool) return []
  try {
    const { rows } = await pool.query(
      `SELECT id, player_id, type, money, create_at FROM money_logs ORDER BY create_at DESC`,
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchAllMoneyLogs:', err.message)
    return []
  }
}

async function _rdsUpsertMoneyLog(pool, row) {
  const now = Date.now()
  const payload = {
    user_id: String(row.user_id),
    player_id: Number(row.player_id),
    type: String(row.type || 'Recharge'),
    money: Number(row.money) || 0,
    currency: String(row.currency || 'CNY'),
    description: String(row.description || ''),
    is_auto: Number(row.is_auto) ? 1 : 0,
    create_at: Number(row.create_at) || now,
    updated_at: Number(row.updated_at) || now,
  }
  const id = Number(row.id) || 0
  if (id > 0) {
    const { rows } = await pool.query(
      `INSERT INTO money_logs (id, user_id, player_id, type, money, currency, description, is_auto, create_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         type = EXCLUDED.type,
         money = EXCLUDED.money,
         currency = EXCLUDED.currency,
         description = EXCLUDED.description,
         is_auto = EXCLUDED.is_auto,
         create_at = EXCLUDED.create_at,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        id,
        payload.user_id,
        payload.player_id,
        payload.type,
        payload.money,
        payload.currency,
        payload.description,
        payload.is_auto,
        payload.create_at,
        payload.updated_at,
      ],
    )
    return rows?.[0] ?? null
  }
  const { rows } = await pool.query(
    `INSERT INTO money_logs (user_id, player_id, type, money, currency, description, is_auto, create_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      payload.user_id,
      payload.player_id,
      payload.type,
      payload.money,
      payload.currency,
      payload.description,
      payload.is_auto,
      payload.create_at,
      payload.updated_at,
    ],
  )
  return rows?.[0] ?? null
}

async function upsertMoneyLog(row) {
  if (!row?.user_id || row?.player_id == null) return null
  const now = Date.now()
  const payload = {
    user_id: String(row.user_id),
    player_id: Number(row.player_id),
    type: String(row.type || 'Recharge'),
    money: Number(row.money) || 0,
    currency: String(row.currency || 'CNY'),
    description: String(row.description || ''),
    is_auto: Number(row.is_auto) ? 1 : 0,
    create_at: Number(row.create_at) || now,
    updated_at: Number(row.updated_at) || now,
  }
  const id = Number(row.id) || 0
  const pool = getPgPool()
  if (!pool) return null
  try {
    return await _rdsUpsertMoneyLog(pool, { id: id || undefined, ...payload })
  } catch (err) {
    console.warn('[rds] upsertMoneyLog:', err.message)
    return null
  }
}

async function deleteMoneyLogById(logId, userId) {
  const id = Number(logId)
  if (!Number.isFinite(id) || id <= 0) return false
  const pool = getPgPool()
  if (!pool) return false
  try {
    const params = [id]
    let where = 'id = $1'
    if (userId) {
      params.push(String(userId))
      where += ` AND user_id = $${params.length}`
    }
    const res = await pool.query(`DELETE FROM money_logs WHERE ${where}`, params)
    return (res.rowCount ?? 0) > 0
  } catch (err) {
    console.warn('[rds] deleteMoneyLogById:', err.message)
    return false
  }
}

async function deleteMoneyLogsByPlayer(playerId) {
  const pid = Number(playerId)
  if (!Number.isFinite(pid)) return false
  const pool = getPgPool()
  if (!pool) return false
  try {
    const res = await pool.query('DELETE FROM money_logs WHERE player_id = $1', [pid])
    return (res.rowCount ?? 0) > 0
  } catch (err) {
    console.warn('[rds] deleteMoneyLogsByPlayer:', err.message)
    return false
  }
}

/**
 * 更新订单 link 绑定。
 * A8 客户端只传 LinkID + Provider + OrderID（无 PlayerID），需用 provider 或仅 user+order_id 匹配。
 */
async function updateOrderBind(orderId, userId, link, opts = {}) {
  if (!orderId || !userId) return false
  const playerId = Number(opts.playerId)
  const provider = opts.provider ? String(opts.provider) : ''
  const linkVal = Number(link) || 0
  const pool = getPgPool()
  if (!pool) return false
  try {
    const params = [linkVal, String(userId), String(orderId)]
    let where = "user_id = $2 AND order_id = $3"
    if (Number.isFinite(playerId) && playerId > 0) {
      params.push(playerId)
      where += ` AND player_id = $${params.length}`
    } else if (provider) {
      params.push(provider)
      where += ` AND provider = $${params.length}`
    }
    const res = await pool.query(`UPDATE orders SET link = $1 WHERE ${where}`, params)
    return res.rowCount > 0
  } catch (err) {
    console.warn('[rds] updateOrderBind:', err.message)
    return false
  }
}

// ── auth（JWT + RDS users 表）──────────────────────────────────────────

/** 密码登录；返回 { accessToken, refreshToken, userId, email } 或 null */
async function authSignIn(userName, password) {
  const name = String(userName || "").trim();
  const pwd = String(password || "");
  if (!name || !pwd) return null;

  const pool = getPgPool();
  if (!pool || !JWT_SECRET) return null;
  try {
    const { rows } = await pool.query(
      `SELECT id, user_name FROM users
       WHERE lower(user_name) = lower($1)
         AND password_hash = crypt($2, password_hash)`,
      [name, pwd],
    );
    const row = rows[0];
    if (!row) return null;
    const userId = String(row.id);
    const sessionId = crypto.randomUUID();
    const accessToken = signJwt(
      { sub: userId, typ: "access", session_id: sessionId },
      JWT_SECRET,
      JWT_ACCESS_TTL_SEC,
    );
    const refreshToken = signJwt(
      { sub: userId, typ: "refresh", session_id: sessionId },
      JWT_SECRET,
      JWT_REFRESH_TTL_SEC,
    );
    if (!(await setActiveSessionId(userId, sessionId))) return null;
    return {
      accessToken,
      refreshToken,
      userId,
      email: `${row.user_name}@gamebet.local`,
    };
  } catch (err) {
    console.warn("[rds] authSignIn:", err.message);
    return { error: "db", message: err.message };
  }
}

/** 登出（JWT 无服务端 session，no-op） */
async function authSignOut(_token) {}

async function fetchUserActiveSessionId(userId) {
  const pool = getPgPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `SELECT metadata->>'active_session_id' AS sid FROM users WHERE id = $1`,
      [String(userId)],
    );
    const sid = rows[0]?.sid;
    return sid ? String(sid) : "";
  } catch (err) {
    console.warn("[rds] fetchUserActiveSessionId:", err.message);
    return null;
  }
}

/** 无 active_session_id 时放行（旧会话）；有则必须与 token 内 session_id 一致 */
async function isSessionActive(userId, sessionId) {
  if (!sessionId) return false;
  const active = await fetchUserActiveSessionId(userId);
  if (active === null) return false;
  if (!active) return true;
  return active === String(sessionId);
}

async function setActiveSessionId(userId, sessionId) {
  const pool = getPgPool();
  if (!pool || !userId || !sessionId) return false;
  try {
    const { rowCount } = await pool.query(
      `UPDATE users SET metadata = metadata || $2::jsonb, updated_at = $3 WHERE id = $1`,
      [String(userId), JSON.stringify({ active_session_id: String(sessionId) }), Date.now()],
    );
    return rowCount > 0;
  } catch (err) {
    console.warn("[rds] setActiveSessionId:", err.message);
    return false;
  }
}

/** 校验 token；返回 { userId, metadata } 或 null */
async function authGetUser(token) {
  if (!token || !JWT_SECRET) return null;
  const payload = verifyJwt(token, JWT_SECRET);
  if (!payload?.sub || payload.typ !== "access") return null;
  const sessionId = payload.session_id ? String(payload.session_id) : "";
  if (!(await isSessionActive(payload.sub, sessionId))) return null;
  return { userId: String(payload.sub), metadata: {} };
}

/** 用 refresh token 换取新的 access/refresh token；{ revoked: true } 表示已在别处登录 */
async function authRefreshToken(refreshToken) {
  if (!JWT_SECRET) return null;
  const payload = verifyJwt(refreshToken, JWT_SECRET);
  if (!payload?.sub || payload.typ !== "refresh") return null;
  const userId = String(payload.sub);
  const sessionId = payload.session_id ? String(payload.session_id) : "";
  if (!sessionId) return { revoked: true };
  const active = await fetchUserActiveSessionId(userId);
  if (active === null) return null;
  if (active && active !== sessionId) return { revoked: true };
  const pool = getPgPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      "SELECT user_name FROM users WHERE id = $1",
      [userId],
    );
    const row = rows[0];
    if (!row) return null;
    const accessToken = signJwt(
      { sub: userId, typ: "access", session_id: sessionId },
      JWT_SECRET,
      JWT_ACCESS_TTL_SEC,
    );
    const newRefresh = signJwt(
      { sub: userId, typ: "refresh", session_id: sessionId },
      JWT_SECRET,
      JWT_REFRESH_TTL_SEC,
    );
    return {
      accessToken,
      refreshToken: newRefresh,
      userId,
      email: `${row.user_name}@gamebet.local`,
    };
  } catch (err) {
    console.warn("[rds] authRefreshToken:", err.message);
    return null;
  }
}

/** 写入 user metadata（fire-and-forget；单 session 请用 setActiveSessionId） */
function writeUserMetadata(userId, metadata) {
  const pool = getPgPool();
  if (!pool) return;
  Promise.resolve()
    .then(() =>
      pool.query(
        "UPDATE users SET metadata = metadata || $2::jsonb, updated_at = $3 WHERE id = $1",
        [String(userId), JSON.stringify(metadata || {}), Date.now()],
      ),
    )
    .catch((err) => console.warn("[rds] writeUserMetadata:", err.message));
}

function hasAdminAccess() {
  return !!getPgPool()
}

function isAuthConfigured() {
  return !!(hasDatabaseUrlConfig() && JWT_SECRET.length >= 16)
}

/** 兼容旧调用方；RDS 模式下无外部 service client */
function getServiceClient() {
  return null
}

export {
  hasAdminAccess,
  isAuthConfigured,
  getServiceClient,
  setPlatformMatchId,
  fetchProfiles,
  fetchProfileById,
  writeProfile,
  insertProfile,
  writeAccounts,
  writeClientMatches,
  writeClientMatchesAsync,
  fetchClientMatches,
  fetchClientMatchesMeta,
  initLastWrittenIds,
  clearClientMatchesOnStartup,
  fetchPlatformMatches,
  fetchPlatformBets,
  fetchLiveTimers,
  writePlatformMatches,
  writePlatformBets,
  replacePlatformBetsForMatch,
  writeLiveTimers,
  fetchOrdersByDate,
  fetchOrdersByPlayer,
  fetchProfilesAdmin,
  fetchOrdersAdminStats,
  fetchOrdersAdminPage,
  fetchOrdersAdminAll,
  fetchOrdersForMonthAggregate,
  fetchOrdersForProfitAggregate,
  fetchMoneyLogsByPlayer,
  fetchMoneyLogById,
  fetchAllMoneyLogs,
  upsertMoneyLog,
  deleteMoneyLogById,
  deleteMoneyLogsByPlayer,
  upsertOrders,
  updateOrderBind,
  authSignIn,
  authSignOut,
  authGetUser,
  authRefreshToken,
  writeUserMetadata,
};
