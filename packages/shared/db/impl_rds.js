/**
 * impl_rds — 数据读写全走 RDS（由 GAMEBET_DB_SCRIPT=rds 选择）；matcher 队表仍可用 getServiceClient()
 *
 * 分工原则：
 *   读取 → supabase（anon key + 用户 JWT，受 RLS 约束）
 *   写入 → supabaseAdmin（service_role，绕过 RLS）
 *
 * 命名约定：
 *   fetch*  — async 读取，返回数据或 null/[]
 *   write*  — fire-and-forget 写入，不阻塞调用方
 *   upsert* — async 写入，需要确认结果
 */

import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase, supabaseAdmin } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** @returns {typeof import('pg')} */
function requirePg() {
  const searchPaths = [
    path.join(__dirname, "..", "..", "apps", "backend", "node_modules"),
    path.join(__dirname, "..", "..", "node_modules"),
    path.join(__dirname, "..", "node_modules"),
  ];
  return require(require.resolve("pg", { paths: searchPaths }));
}

const AUTH_MODE = String(process.env.AUTH_MODE || "supabase").trim().toLowerCase();
const isJwtMode = () => AUTH_MODE === "jwt";
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

let _pgPool = null;

/** impl_rds：采集与业务表读写 RDS（由 GAMEBET_DB_SCRIPT=rds 启动脚本选择） */
function collectReadsFromRds() {
  return true;
}
function collectWritesToRds() {
  return true;
}
function collectWritesToSupabase() {
  return false;
}
function businessUsesRds() {
  return true;
}
function businessWritesToSupabase() {
  return false;
}
function businessWritesToRds() {
  return true;
}

function needsPgPool() {
  return !!process.env.DATABASE_URL;
}

function getPgPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[db] impl_rds: 未配置 DATABASE_URL");
    return null;
  }
  if (!_pgPool) {
    const { Pool } = requirePg();
    _pgPool = new Pool({ connectionString: url, max: 4 });
    const why = isJwtMode() ? "AUTH_MODE=jwt + rds" : "GAMEBET_DB_SCRIPT=rds";
    console.log("[db] RDS 连接池已就绪 (" + why + ")");
  }
  return _pgPool;
}

console.log(
  "[db] impl_rds: platform_* / live_timers / client_matches / profiles / orders 读写 RDS",
);


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

/**
 * fire-and-forget 写入（service_role）。
 * supabaseAdmin 未配置时静默跳过，本地内存仍正常运行。
 */
function _write(fn, label = '') {
  if (!supabaseAdmin) return
  Promise.resolve().then(() => fn(supabaseAdmin)).catch((err) =>
    console.warn(`[supabase${label ? ':' + label : ''}]`, err.message)
  )
}

/** 迁 RDS：与 Supabase 并行写入（fire-and-forget） */
function _writeRds(fn, label = "") {
  if (!collectWritesToRds()) return;
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

  let updated = false;
  let skipped = false;
  let conflict = false;

  if (collectWritesToSupabase() && supabaseAdmin) {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("platform_matches")
      .select("match_id")
      .eq("platform", plat)
      .eq("source_match_id", srcId)
      .maybeSingle();
    if (fetchErr) throw new Error(`查询 platform_matches 失败: ${fetchErr.message}`);
    if (!existing) {
      skipped = true;
    } else {
      const cur =
        existing.match_id != null && existing.match_id !== "" ? Number(existing.match_id) : null;
      if (cur === cmId) skipped = true;
      else if (cur != null && cur !== cmId && onlyIfNull) conflict = true;
      else {
        let q = supabaseAdmin
          .from("platform_matches")
          .update({ match_id: cmId })
          .eq("platform", plat)
          .eq("source_match_id", srcId);
        if (onlyIfNull) q = q.is("match_id", null);
        const { error: updErr } = await q;
        if (updErr) throw new Error(`回写 match_id 失败 (${plat}:${srcId}): ${updErr.message}`);
        updated = true;
      }
    }
  }

  if (collectWritesToRds()) {
    const pool = getPgPool();
    if (pool) {
      const { rows } = await pool.query(
        "SELECT match_id FROM platform_matches WHERE platform = $1 AND source_match_id = $2",
        [plat, srcId],
      );
      if (!rows.length) {
        if (!skipped) skipped = true;
      } else {
        const cur =
          rows[0].match_id != null && rows[0].match_id !== "" ? Number(rows[0].match_id) : null;
        if (cur === cmId) {
          if (!updated) skipped = true;
        } else if (cur != null && cur !== cmId && onlyIfNull) {
          conflict = true;
        } else {
          const n = await _rdsSetPlatformMatchId(pool, plat, srcId, cmId, onlyIfNull);
          if (n > 0) updated = true;
        }
      }
    }
  }

  return { updated, skipped, conflict };
}

// ── profiles ──────────────────────────────────────────────────────────

/** 拉取所有 profiles 到内存（启动时调用） */
async function fetchProfiles(sessionClient) {
  if (businessUsesRds()) {
    const pool = getPgPool();
    if (pool) {
      try {
        const { rows } = await pool.query("SELECT * FROM profiles");
        return rows || [];
      } catch (err) {
        console.error("[rds] fetchProfiles 失败:", err.message);
        return [];
      }
    }
  }
  const client = sessionClient || supabase
  if (!client) return []
  try {
    const { data, error } = await client.from('profiles').select('*')
    if (error) throw error
    return data || []
  } catch (err) {
    console.error('[supabase] fetchProfiles 失败:', err.message)
    return []
  }
}

/** 按 uid 读单个 profile */
async function fetchProfileById(uid) {
  if (isJwtMode() || businessUsesRds()) {
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
  if (!supabase) return null
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', String(uid)).single()
    if (error || !data) return null
    return data
  } catch { return null }
}

/** fire-and-forget：更新 profile 字段 */
function writeProfile(uid, patch) {
  const now = Date.now();
  const payload = { ...patch, updated_at: now };
  if (businessWritesToSupabase()) {
    _write(async (client) => {
      const { error } = await client.from('profiles')
        .update(payload).eq('id', String(uid))
      if (error) throw error
    }, 'profiles')
  }
  if (businessWritesToRds()) {
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
}

/** 在 profiles 表中创建新用户行（首次登录触发器未执行时的兜底） */
async function insertProfile(uid, data) {
  const pool = getPgPool();
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
  let ok = true;

  if ((isJwtMode() || businessWritesToRds()) && pool) {
    try {
      await pool.query(
        `INSERT INTO profiles (id, user_name, accounts, betting_config, collect_config, preferences, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        rdsArgs,
      );
    } catch (err) {
      console.warn("[rds] insertProfile:", err.message);
      ok = false;
    }
  }

  if (businessUsesRds() && !businessWritesToSupabase()) return ok;

  if (!isJwtMode() && supabaseAdmin) {
    const { error } = await supabaseAdmin.from("profiles").insert(data);
    if (error) ok = false;
  } else if (!isJwtMode() && !businessUsesRds()) {
    return false;
  }
  return ok;
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

async function _upsertClientMatches(client, dedupedRows, toDelete) {
  if (dedupedRows.length) {
    const { error } = await client.from('client_matches')
      .upsert(dedupedRows, { onConflict: 'id' })
    if (error) throw error
  }
  if (toDelete.length) {
    const { error: delErr } = await client.from('client_matches')
      .delete().in('id', toDelete)
    if (delErr) throw delErr
  }
}

/** fire-and-forget：upsert 客户端比赛列表，只删离开活跃列表的行 */
function writeClientMatches(rows) {
  const prepared = _prepareClientMatchWrite(rows)
  if (!prepared) return
  const { dedupedRows, toDelete } = prepared
  if (collectWritesToSupabase()) {
    _write((client) => _upsertClientMatches(client, dedupedRows, toDelete), 'client_matches')
  }
  _writeRds((pool) => _rdsUpsertClientMatches(pool, dedupedRows, toDelete), "client_matches")
}

/** await 写入完成（matcher / rebuild 使用，避免前端读到上一版） */
async function writeClientMatchesAsync(rows) {
  const prepared = _prepareClientMatchWrite(rows)
  if (!prepared) return
  const { dedupedRows, toDelete } = prepared
  const tasks = []
  if (collectWritesToSupabase() && supabaseAdmin) {
    tasks.push(_upsertClientMatches(supabaseAdmin, dedupedRows, toDelete))
  }
  if (collectWritesToRds()) {
    const pool = getPgPool()
    if (pool) tasks.push(_rdsUpsertClientMatches(pool, dedupedRows, toDelete))
  }
  if (!tasks.length) {
    writeClientMatches(rows)
    return
  }
  await Promise.all(tasks)
}

/** 启动时预填 _lastWrittenIds，使差量删除能覆盖上次遗留行 */
async function initLastWrittenIds() {
  if (collectReadsFromRds()) {
    const pool = getPgPool()
    if (pool) {
      try {
        await _rdsInitLastWrittenIds(pool)
        return
      } catch (err) {
        console.warn('[rds] initLastWrittenIds 失败:', err.message)
      }
    }
  }
  if (!collectWritesToSupabase()) return
  const client = supabaseAdmin || supabase
  if (!client) return
  try {
    const { data, error } = await client.from('client_matches').select('id')
    if (error || !data) return
    _lastWrittenIds = new Set(data.map(r => Number(r.id)))
    console.log(`[supabase] 已从 client_matches 加载 ${_lastWrittenIds.size} 条 id，首次 rebuild 可正确差量删除遗留行`)
  } catch (err) {
    console.warn('[supabase] initLastWrittenIds 失败:', err.message)
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
  if (collectReadsFromRds()) {
    const pool = getPgPool()
    if (pool) {
      try {
        return await _rdsFetchClientMatchesMeta(pool)
      } catch (err) {
        console.warn('[rds] fetchClientMatchesMeta 失败:', err.message)
      }
    }
  }
  const client = supabaseAdmin || supabase
  if (!client) return null
  try {
    const [countRes, builtRes] = await Promise.all([
      client.from('client_matches').select('id', { count: 'exact', head: true }),
      client.from('client_matches')
        .select('built_at')
        .order('built_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (countRes.error) throw countRes.error
    if (builtRes.error) throw builtRes.error
    return {
      builtAt: builtRes.data?.built_at != null ? Number(builtRes.data.built_at) : 0,
      count: countRes.count ?? 0,
    }
  } catch (err) {
    console.warn('[supabase] fetchClientMatchesMeta 失败:', err.message)
    return null
  }
}

/**
 * 从 Supabase 读取 client_matches，按 start_time 升序排列。
 * @returns {Promise<object[]|null>} 成功时返回数组（可为空）；失败/未配置时返回 null（调用方可回退内存缓存）。
 */
async function fetchClientMatches() {
  if (collectReadsFromRds()) {
    const pool = getPgPool()
    if (pool) {
      try {
        return await _rdsFetchClientMatches(pool)
      } catch (err) {
        console.warn('[rds] fetchClientMatches 失败:', err.message)
        return null
      }
    }
  }
  const client = supabaseAdmin || supabase
  if (!client) return null
  try {
    const { data, error } = await client
      .from('client_matches')
      .select('*')
      .order('start_time', { ascending: true })
    if (error) {
      console.warn('[supabase] fetchClientMatches 失败:', error.message)
      return null
    }
    return data || []
  } catch (err) {
    console.warn('[supabase] fetchClientMatches 失败:', err.message)
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
  // match_id 由 matcher rebuild（队伍 ID 自动合并）或人工关联回填；SaveMatch 不写，避免 FK 指向不存在的 client_matches.id
  const rows = mapPlatformMatchRows(provider, matchs)
  if (collectWritesToSupabase()) {
    _write(async (client) => {
      const { error } = await client
        .from('platform_matches')
        .upsert(rows, { onConflict: 'platform,source_match_id' })
      if (error) throw error
      // 过期行由 pg_cron 每小时清理（synced_at > 2h），不在写入路径显式 delete
    }, 'platform_matches')
  }
  _writeRds((pool) => _rdsUpsertPlatformMatches(pool, rows), "platform_matches")
}

/** 启动时读取 platform_matches，按平台分组，返回可直接传给 store.saveMatches 的格式 */
async function fetchPlatformMatches() {
  if (collectReadsFromRds()) {
    const pool = getPgPool()
    if (pool) {
      try {
        return await _rdsFetchPlatformMatches(pool)
      } catch (err) {
        console.warn('[rds] fetchPlatformMatches 失败:', err.message)
      }
    }
  }
  const client = supabaseAdmin || supabase
  if (!client) return {}
  const { data, error } = await client
    .from('platform_matches')
    .select('platform,source_match_id,source_game_id,start_time,home,home_id,away,away_id,bo,teams,match_id')
  if (error || !data?.length) return {}
  const byPlatform = {}
  for (const r of data) {
    if (!byPlatform[r.platform]) byPlatform[r.platform] = []
    byPlatform[r.platform].push({
      Type:          r.platform,
      SourceMatchID: r.source_match_id,
      SourceGameID:  r.source_game_id ?? '',
      StartTime:     r.start_time ?? 0,
      Home:          r.home ?? '',
      HomeID:        r.home_id ?? '',
      Away:          r.away ?? '',
      AwayID:        r.away_id ?? '',
      BO:            r.bo ?? 0,
      Teams:         Array.isArray(r.teams) ? r.teams : [],
      ClientMatchId: r.match_id != null ? Number(r.match_id) : null,
    })
  }
  return byPlatform
}

/** 从 Supabase 读取 platform_bets，重组为 store._bets 格式 */
async function fetchPlatformBets() {
  if (collectReadsFromRds()) {
    const pool = getPgPool()
    if (pool) {
      try {
        return await _rdsFetchPlatformBets(pool)
      } catch (err) {
        console.warn('[rds] fetchPlatformBets 失败:', err.message)
      }
    }
  }
  const client = supabaseAdmin || supabase
  if (!client) return {}
  const { data, error } = await client
    .from('platform_bets')
    .select('platform,source_bet_id,source_match_id,map,bet_name,source_home_id,source_away_id,home_odds,away_odds,is_locked')
  if (error || !data?.length) return {}
  const byKey = {}
  for (const r of data) {
    const key = `${r.platform}:${r.source_match_id}`
    if (!byKey[key]) byKey[key] = { provider: r.platform, matchId: r.source_match_id, bets: [], savedAt: 0 }
    byKey[key].bets.push({
      SourceBetID:  r.source_bet_id,
      BetName:      r.bet_name ?? '',
      Map:          r.map ?? 0,
      SourceHomeID: r.source_home_id ?? '',
      SourceAwayID: r.source_away_id ?? '',
      HomeOdds:     r.home_odds ?? 0,
      AwayOdds:     r.away_odds ?? 0,
      Status:       r.is_locked ? 'Locked' : 'Normal',
    })
  }
  return byKey
}

/** 从 Supabase 读取 live_timers，重组为 store._timers 格式 */
async function fetchLiveTimers() {
  if (collectReadsFromRds()) {
    const pool = getPgPool()
    if (pool) {
      try {
        return await _rdsFetchLiveTimers(pool)
      } catch (err) {
        console.warn('[rds] fetchLiveTimers 失败:', err.message)
      }
    }
  }
  const client = supabaseAdmin || supabase
  if (!client) return {}
  const { data, error } = await client
    .from('live_timers')
    .select('platform,source_match_id,round,round_start')
  if (error || !data?.length) return {}
  const byPlatform = {}
  for (const r of data) {
    if (!byPlatform[r.platform]) byPlatform[r.platform] = { provider: r.platform, timer: [], savedAt: 0 }
    byPlatform[r.platform].timer.push({
      MatchID:   r.source_match_id,
      Round:     r.round ?? 0,
      StartTime: r.round_start ?? 0,
    })
  }
  return byPlatform
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
  if (collectWritesToSupabase()) {
    _write(async (client) => {
      const { error } = await client
        .from('platform_bets')
        .upsert(rows, { onConflict: 'platform,source_match_id,source_bet_id' })
      if (error) throw error
    }, 'platform_bets')
  }
  _writeRds((pool) => _rdsUpsertPlatformBets(pool, rows), "platform_bets")
}

/** [A8 可证实] 每场 saveBets 为完整快照：先删该场旧行再 upsert */
function replacePlatformBetsForMatch(provider, matchId, bets) {
  const rows = mapSaveBetRows(provider, matchId, bets)
  if (!rows.length) return
  const plat = String(provider)
  const mid = String(matchId)
  if (collectWritesToSupabase()) {
    _write(async (client) => {
      const { error: delErr } = await client
        .from('platform_bets')
        .delete()
        .eq('platform', plat)
        .eq('source_match_id', mid)
      if (delErr) throw delErr
      const { error } = await client
        .from('platform_bets')
        .upsert(rows, { onConflict: 'platform,source_match_id,source_bet_id' })
      if (error) throw error
    }, 'platform_bets')
  }
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
  if (collectWritesToSupabase()) {
    _write(async (client) => {
      const { error } = await client
        .from('live_timers')
        .upsert(rows, { onConflict: 'platform,source_match_id' })
      if (error) throw error
    }, 'live_timers')
  }
  _writeRds((pool) => _rdsUpsertLiveTimers(pool, rows), "live_timers")
}

// ── orders ────────────────────────────────────────────────────────────

/** 服务端读 orders：须用 service_role（无用户 JWT 时 anon+RLS 恒为空） */
function ordersReadClient() {
  if (businessUsesRds()) return null
  return supabaseAdmin || supabase
}

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

/** 按日期读取订单（userId 隔离；服务端显式 filter，不依赖 RLS） */
async function fetchOrdersByDate(date, userId) {
  const { dayStart, dayEnd } = localDayBounds(date)
  if (businessUsesRds()) {
    const pool = getPgPool()
    if (pool && userId) {
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
  }
  const client = ordersReadClient()
  if (!client || !userId) return []
  const { data, error } = await client
    .from('orders')
    .select('*')
    .eq('user_id', String(userId))
    .gte('create_at', dayStart)
    .lt('create_at', dayEnd)
    .order('create_at', { ascending: false })
  if (error) { console.warn('[supabase] fetchOrdersByDate:', error.message); return [] }
  return data || []
}

/** 按 playerId 读取订单 */
async function fetchOrdersByPlayer(playerId, userId) {
  if (businessUsesRds()) {
    const pool = getPgPool()
    if (pool && userId) {
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
  }
  const client = ordersReadClient()
  if (!client || !userId) return []
  const { data, error } = await client
    .from('orders')
    .select('*')
    .eq('user_id', String(userId))
    .eq('player_id', Number(playerId))
    .order('create_at', { ascending: false })
  if (error) { console.warn('[supabase] fetchOrdersByPlayer:', error.message); return [] }
  return data || []
}

/** upsert 订单列表 */
async function upsertOrders(rows) {
  if (!rows?.length) return false
  let ok = true
  if (businessWritesToSupabase() && supabaseAdmin) {
    const { error } = await supabaseAdmin
      .from('orders')
      .upsert(rows, { onConflict: 'user_id,order_id,player_id', ignoreDuplicates: false })
    if (error) {
      console.warn('[supabase] upsertOrders:', error.message)
      ok = false
    }
  }
  if (businessWritesToRds()) {
    const pool = getPgPool()
    if (pool) {
      try {
        await _rdsUpsertOrders(pool, rows)
      } catch (err) {
        console.warn('[rds] upsertOrders:', err.message)
        ok = false
      }
    }
  }
  if (!businessWritesToSupabase() && !businessWritesToRds()) {
    if (!supabaseAdmin) return false
    const { error } = await supabaseAdmin
      .from('orders')
      .upsert(rows, { onConflict: 'user_id,order_id,player_id', ignoreDuplicates: false })
    if (error) {
      console.warn('[supabase] upsertOrders:', error.message)
      return false
    }
  }
  return ok
}

/** 管理端：全量 profiles 摘要 */
async function fetchProfilesAdmin() {
  if (businessUsesRds()) {
    const pool = getPgPool()
    if (pool) {
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
  }
  const client = getServiceClient()
  if (!client) return []
  const { data, error } = await client
    .from('profiles')
    .select('id, user_name, accounts, betting_config, collect_config, preferences, created_at, updated_at')
    .order('user_name', { ascending: true })
  if (error) {
    console.warn('[supabase] fetchProfilesAdmin:', error.message)
    return []
  }
  return data || []
}

/** 管理端：当日订单汇总 */
async function fetchOrdersAdminStats(dateKey) {
  const { dayStart, dayEnd } = localDayBounds(dateKey)
  if (businessUsesRds()) {
    const pool = getPgPool()
    if (pool) {
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
  }
  const client = ordersReadClient()
  if (!client) return { count: 0, money: 0, betMoney: 0 }
  const { data, error } = await client
    .from('orders')
    .select('money, bet_money, status')
    .gte('create_at', dayStart)
    .lt('create_at', dayEnd)
  if (error) {
    console.warn('[supabase] fetchOrdersAdminStats:', error.message)
    return { count: 0, money: 0, betMoney: 0 }
  }
  let count = 0
  let money = 0
  let betMoney = 0
  for (const o of data || []) {
    if (String(o.status || '') === 'Reject') continue
    count += 1
    money += Number(o.money) || 0
    betMoney += Number(o.bet_money) || 0
  }
  return { count, money, betMoney }
}

/** 管理端：分页订单 */
async function fetchOrdersAdminPage({ dateKey, userId, provider, pageIndex, pageSize }) {
  const { dayStart, dayEnd } = localDayBounds(dateKey)
  const from = (Math.max(1, pageIndex) - 1) * pageSize
  if (businessUsesRds()) {
    const pool = getPgPool()
    if (pool) {
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
  }
  const client = ordersReadClient()
  if (!client) return { rows: [], total: 0 }
  const to = from + pageSize - 1
  let q = client
    .from('orders')
    .select('*', { count: 'exact' })
    .gte('create_at', dayStart)
    .lt('create_at', dayEnd)
    .order('create_at', { ascending: false })
  if (userId) q = q.eq('user_id', String(userId))
  if (provider) q = q.eq('provider', String(provider))
  const { data, error, count } = await q.range(from, to)
  if (error) {
    console.warn('[supabase] fetchOrdersAdminPage:', error.message)
    return { rows: [], total: 0 }
  }
  return { rows: data || [], total: count ?? 0 }
}

/** 排行榜：按本地自然日读取订单盈利聚合字段（service_role） */
async function fetchOrdersForProfitAggregate(dateKey) {
  const { dayStart, dayEnd } = localDayBounds(dateKey)
  if (businessUsesRds()) {
    const pool = getPgPool()
    if (pool) {
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
  }
  const client = ordersReadClient()
  if (!client) return []
  const { data, error } = await client
    .from('orders')
    .select('user_id, money, bet_money, status')
    .gte('create_at', dayStart)
    .lt('create_at', dayEnd)
  if (error) {
    console.warn('[supabase] fetchOrdersForProfitAggregate:', error.message)
    return []
  }
  return data || []
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
  let ok = false

  if (businessWritesToSupabase() && supabaseAdmin) {
    let q = supabaseAdmin
      .from('orders')
      .update({ link: linkVal })
      .eq('user_id', String(userId))
      .eq('order_id', String(orderId))
    if (Number.isFinite(playerId) && playerId > 0) {
      q = q.eq('player_id', playerId)
    } else if (provider) {
      q = q.eq('provider', provider)
    }
    const { data, error } = await q.select('id')
    if (error) {
      console.warn('[supabase] updateOrderBind:', error.message, { orderId, userId, playerId, provider })
    } else if (data?.length) ok = true
    else console.warn('[supabase] updateOrderBind: no rows matched', { orderId, userId, playerId, provider })
  }

  if (businessWritesToRds()) {
    const pool = getPgPool()
    if (pool) {
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
        if (res.rowCount > 0) ok = true
      } catch (err) {
        console.warn('[rds] updateOrderBind:', err.message)
      }
    }
  }

  if (!businessWritesToSupabase() && !businessWritesToRds()) {
    if (!supabaseAdmin) return false
    let q = supabaseAdmin
      .from('orders')
      .update({ link: linkVal })
      .eq('user_id', String(userId))
      .eq('order_id', String(orderId))
    if (Number.isFinite(playerId) && playerId > 0) {
      q = q.eq('player_id', playerId)
    } else if (provider) {
      q = q.eq('provider', provider)
    }
    const { data, error } = await q.select('id')
    if (error) {
      console.warn('[supabase] updateOrderBind:', error.message, { orderId, userId, playerId, provider })
      return false
    }
    if (!data?.length) {
      console.warn('[supabase] updateOrderBind: no rows matched', { orderId, userId, playerId, provider })
      return false
    }
    return true
  }
  return ok
}

// ── auth（AUTH_MODE=supabase|jwt，见 .env）──────────────────────────────

/** 密码登录；返回 { accessToken, refreshToken, userId, email } 或 null */
async function authSignIn(userName, password) {
  const name = String(userName || "").trim();
  const pwd = String(password || "");
  if (!name || !pwd) return null;

  if (isJwtMode()) {
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
      const refreshToken = signJwt({ sub: userId, typ: "refresh" }, JWT_SECRET, JWT_REFRESH_TTL_SEC);
      return {
        accessToken,
        refreshToken,
        userId,
        email: `${row.user_name}@gamebet.local`,
      };
    } catch (err) {
      console.warn("[rds] authSignIn:", err.message);
      return null;
    }
  }

  if (!supabase) return null
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${name.toLowerCase()}@gamebet.local`,
    password: pwd,
  })
  if (error || !data?.session) return null
  return {
    accessToken:  data.session.access_token,
    refreshToken: data.session.refresh_token,
    userId: data.user.id,
    email:  data.user.email,
  }
}

/** 登出指定 token 对应的 session */
async function authSignOut(token) {
  if (!token) return
  if (isJwtMode()) return
  if (!supabase) return
  await supabase.auth.admin.signOut(token).catch(() => {})
}

/** 校验 token；返回 { userId, metadata } 或 null */
async function authGetUser(token) {
  if (!token) return null

  if (isJwtMode()) {
    if (!JWT_SECRET) return null
    const payload = verifyJwt(token, JWT_SECRET)
    if (!payload?.sub || payload.typ !== "access") return null
    return { userId: String(payload.sub), metadata: {} }
  }

  const payload = decodeJwtPayload(token)
  if (!payload?.sub) return null
  if (payload.exp && payload.exp * 1000 < Date.now()) return null
  return { userId: String(payload.sub), metadata: {} }
}

/** 写入 user_metadata（fire-and-forget，用于单 session 限制） */
function writeUserMetadata(userId, metadata) {
  if (isJwtMode()) {
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
    return;
  }
  if (!supabaseAdmin) return
  Promise.resolve()
    .then(() => supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: metadata }))
    .catch((err) => console.warn('[supabase] writeUserMetadata:', err.message))
}

/** service_role 可用时返回 true */
function hasAdminAccess() {
  if (isJwtMode() || businessUsesRds()) return !!getPgPool()
  return !!supabaseAdmin
}

/** 是否已配置登录（supabase 或 jwt） */
function isAuthConfigured() {
  if (isJwtMode()) return !!(process.env.DATABASE_URL && JWT_SECRET.length >= 16)
  return !!supabase
}

/** 写入 client_matches / matcher 使用的 Supabase 客户端 */
function getServiceClient() {
  return supabaseAdmin || supabase
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
  fetchOrdersForProfitAggregate,
  upsertOrders,
  updateOrderBind,
  authSignIn,
  authSignOut,
  authGetUser,
  writeUserMetadata,
};
