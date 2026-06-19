/**
 * impl_rds — 数据读写全走 RDS（PostgreSQL + JWT 鉴权）。
 *
 * 命名约定：
 *   fetch*  — async 读取，返回数据或 null/[]
 *   write*  — fire-and-forget 写入，不阻塞调用方
 *   upsert* — async 写入，需要确认结果
 */

import crypto from "node:crypto";
import { hasDatabaseUrlConfig } from "./resolve_database_url.js";
import { CLIENT_MATCH_LIST_HIDDEN, CLIENT_MATCH_LIST_DEFAULT } from "./client_match_list_status.js";
import { getPgPool, _writeRds, _writeRdsAsync, _jsonb } from "./rds/common.js";
import { localDayBounds, localMonthBounds } from "./rds/time_bounds.js";
import { SQL_ORDERS_VISIBLE } from "./order_link_filter.js";
import {
  JWT_SECRET,
  JWT_ACCESS_TTL_SEC,
  JWT_REFRESH_TTL_SEC,
  signJwt,
  verifyJwt,
} from "./rds/jwt.js";
import {
  fetchMoneyLogsForMonthAggregate,
  fetchMoneyLogsByPlayer,
  fetchMoneyLogById,
  fetchAllMoneyLogs,
  upsertMoneyLog,
  deleteMoneyLogById,
  deleteMoneyLogsByPlayer,
} from "./rds/money_log_store.js";
import {
  fetchTagPlatforms,
  upsertTagPlatformByName,
  insertPlayerRow,
  fetchPlayerById,
  updatePlayerBalanceRow,
  insertUserLogRow,
  fetchUserLogsInRange,
  softDeletePlayerRow,
} from "./rds/player_store.js";
import {
  fetchProfiles,
  fetchProfileById,
  writeProfile,
  insertProfile,
  writeAccounts,
  fetchProfilesAdmin,
  writeUserMetadata,
  updateUserName,
  updateUserIsAdmin,
} from "./rds/profile_store.js";

/** 读路径：系统单 + 非 PB hash；仅排除 PB 未 bind 的 hash 单 */
const SQL_NON_EXT = SQL_ORDERS_VISIBLE;

function _mapLiveTimerRows(provider, timer) {
  if (!Array.isArray(timer)) return null;
  const plat = String(provider);
  const now = Date.now();
  const seen = new Map();
  for (const t of timer) {
    if (!t || t.MatchID == null) continue;
    const source_match_id = String(t.MatchID);
    seen.set(source_match_id, {
      platform: plat,
      source_match_id,
      round: Number(t.Round) || 0,
      round_start: Number(t.StartTime) || 0,
      updated_at: now,
    });
  }
  return { plat, rows: [...seen.values()] };
}

/** 删除该平台本批快照之外的 platform_matches / platform_bets（对齐 store._matches 整批替换） */
async function _rdsDeletePlatformSnapshotOrphans(exec, platform, keepSourceMatchIds) {
  const plat = String(platform);
  const ids = keepSourceMatchIds.map(String);
  if (!ids.length) return;
  await exec.query(
    `DELETE FROM platform_bets
     WHERE platform = $1 AND NOT (source_match_id = ANY($2::text[]))`,
    [plat, ids],
  );
  await exec.query(
    `DELETE FROM platform_matches
     WHERE platform = $1 AND NOT (source_match_id = ANY($2::text[]))`,
    [plat, ids],
  );
}

async function _rdsUpsertPlatformMatches(pool, rows) {
  if (!rows.length) return;
  const client = await pool.connect();
  const platform = String(rows[0].platform);
  const keepIds = rows.map((r) => String(r.source_match_id));
  const sql = `
    INSERT INTO platform_matches (
      platform, source_match_id, source_game_id, start_time,
      home_id, home, away_id, away, bo, is_live, teams, synced_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
    ON CONFLICT (platform, source_match_id) DO UPDATE SET
      source_game_id = EXCLUDED.source_game_id,
      start_time = EXCLUDED.start_time,
      home_id = EXCLUDED.home_id,
      home = EXCLUDED.home,
      away_id = EXCLUDED.away_id,
      away = EXCLUDED.away,
      bo = EXCLUDED.bo,
      is_live = EXCLUDED.is_live,
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
        r.is_live,
        JSON.stringify(Array.isArray(r.teams) ? r.teams : []),
        r.synced_at,
      ]);
    }
    await _rdsDeletePlatformSnapshotOrphans(client, platform, keepIds);
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

/** 全量替换某平台 timer 快照：先删该平台全部行，再 upsert 本批（空批 = 清空该平台） */
async function _rdsReplaceLiveTimersForPlatform(pool, platform, rows) {
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
    await client.query("DELETE FROM live_timers WHERE platform = $1", [String(platform)]);
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
      matchs, bets, reverse, built_at, list_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14)
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
      built_at = EXCLUDED.built_at,
      list_status = EXCLUDED.list_status
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
        Number(r.list_status ?? CLIENT_MATCH_LIST_DEFAULT),
      ]);
    }
    if (toDelete.length) {
      await client.query(
        `DELETE FROM client_matches WHERE id = ANY($1::bigint[]) AND list_status IS DISTINCT FROM $2`,
        [toDelete, CLIENT_MATCH_LIST_HIDDEN],
      );
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
    `SELECT platform, source_match_id, source_game_id, start_time, home, home_id, away, away_id, bo, is_live, teams, match_id
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
      IsLive: r.is_live != null ? Number(r.is_live) : undefined,
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
  const { rows } = await pool.query(
    `SELECT * FROM client_matches
     WHERE list_status IS DISTINCT FROM $1
     ORDER BY start_time ASC NULLS LAST`,
    [CLIENT_MATCH_LIST_HIDDEN],
  );
  return rows;
}

async function _rdsFetchClientMatchesMeta(pool) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count, COALESCE(MAX(built_at), 0)::bigint AS built_at
     FROM client_matches
     WHERE list_status IS DISTINCT FROM $1`,
    [CLIENT_MATCH_LIST_HIDDEN],
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
    is_live: m.IsLive != null ? Number(m.IsLive) : null,
    teams: Array.isArray(m.Teams) ? m.Teams : [],
    synced_at: now,
  }));
}

/** fire-and-forget：按平台快照 upsert 本批比赛，并删除本批之外的孤儿行（含 platform_bets） */
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

/** fire-and-forget：全量替换某平台 timer 快照（对齐 A8 getTimer 整包提交；空数组清空该平台） */
function writeLiveTimers(provider, timer) {
  const mapped = _mapLiveTimerRows(provider, timer);
  if (!mapped) return;
  const { plat, rows } = mapped;
  _writeRds((pool) => _rdsReplaceLiveTimersForPlatform(pool, plat, rows), "live_timers");
}

/** await 写入完成（API_SaveLiveTimer 使用，避免紧随其后的 GetMatchs 读到旧 RDS） */
async function writeLiveTimersAsync(provider, timer) {
  const mapped = _mapLiveTimerRows(provider, timer);
  if (!mapped) return;
  const { plat, rows } = mapped;
  await _writeRdsAsync((pool) => _rdsReplaceLiveTimersForPlatform(pool, plat, rows), "live_timers");
}

/** 运维/部署：清空某平台 live_timers（等待下次 saveLiveTimer 或 matcher rebuild 刷新 Round） */
async function purgePlatformLiveTimers(platform) {
  const plat = String(platform || "").trim();
  if (!plat) throw new Error("platform required");
  await _writeRdsAsync((pool) => _rdsReplaceLiveTimersForPlatform(pool, plat, []), "live_timers");
}

// ── orders ────────────────────────────────────────────────────────────

async function _rdsUpsertOrders(pool, rows) {
  if (!rows?.length) return [];
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
    RETURNING *, (xmax = 0) AS was_inserted
  `;
  const inserted = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const o of rows) {
      const res = await client.query(sql, [
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
      const row = res.rows?.[0];
      if (row?.was_inserted) {
        const { was_inserted: _wi, ...clean } = row;
        inserted.push(clean);
      }
    }
    await client.query("COMMIT");
    return inserted;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** orders 新行写入后回调（由 backend 注册 Telegram 等） */
let _ordersInsertedHook = null;

function setOrdersInsertedHook(fn) {
  _ordersInsertedHook = typeof fn === "function" ? fn : null;
}

/** SaveOrderBind 将 link 从外部 hash 改为套利/单边后回调 */
let _ordersBoundHook = null;

function setOrdersBoundHook(fn) {
  _ordersBoundHook = typeof fn === "function" ? fn : null;
}

function _isExternalOrderLink(link) {
  const n = Number(link);
  if (!Number.isFinite(n) || n === 0) return true;
  if (n > 0 && n < 1_000_000_000_000) return true;
  return false;
}

/** upsert 订单列表；新插入行经 setOrdersInsertedHook 通知 */
async function upsertOrders(rows) {
  if (!rows?.length) return false
  const pool = getPgPool()
  if (!pool) return false
  try {
    const inserted = await _rdsUpsertOrders(pool, rows)
    if (inserted.length && _ordersInsertedHook) {
      try {
        _ordersInsertedHook(inserted)
      } catch (hookErr) {
        console.warn('[rds] ordersInsertedHook:', hookErr.message)
      }
    }
    return true
  } catch (err) {
    console.warn('[rds] upsertOrders:', err.message)
    return false
  }
}

/** 按日期读取订单（userId 隔离；不含 PB hash 占位单） */
async function fetchOrdersByDate(date, userId) {
  const { dayStart, dayEnd } = localDayBounds(date)
  const pool = getPgPool()
  if (!pool || !userId) return []
  try {
    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE user_id = $1 AND create_at >= $2 AND create_at < $3 AND ${SQL_NON_EXT} ORDER BY create_at DESC`,
      [String(userId), dayStart, dayEnd],
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchOrdersByDate:', err.message)
    return []
  }
}

/** 按 playerId 读取订单（不含 PB hash 占位单） */
async function fetchOrdersByPlayer(playerId, userId) {
  const pool = getPgPool()
  if (!pool || !userId) return []
  try {
    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE user_id = $1 AND player_id = $2 AND ${SQL_NON_EXT} ORDER BY create_at DESC`,
      [String(userId), Number(playerId)],
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchOrdersByPlayer:', err.message)
    return []
  }
}

/** saveOrder 保留已有 link 绑定，需含外部单 */
async function fetchOrdersByPlayerAll(playerId, userId) {
  const pool = getPgPool()
  if (!pool || !userId) return []
  try {
    const { rows } = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1 AND player_id = $2 ORDER BY create_at DESC',
      [String(userId), Number(playerId)],
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchOrdersByPlayerAll:', err.message)
    return []
  }
}

/** 运维：同 Link 订单（含外部 hash link） */
async function fetchOrdersByLink(userId, link) {
  const pool = getPgPool()
  const uid = String(userId || '').trim()
  const linkVal = Number(link)
  if (!pool || !uid || !Number.isFinite(linkVal) || linkVal === 0) return []
  try {
    const { rows } = await pool.query(
      `SELECT order_id, user_id, player_id, link, provider, match, bet, item,
              odds, bet_money, money, status, create_at
       FROM orders WHERE user_id = $1 AND link = $2
       ORDER BY create_at ASC`,
      [uid, linkVal],
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchOrdersByLink:', err.message)
    return []
  }
}

/** 运维：按 order_id 查单行（含外部单） */
async function fetchOrderByOrderId(userId, orderId) {
  const pool = getPgPool()
  const uid = String(userId || '').trim()
  const oid = String(orderId || '').trim()
  if (!pool || !uid || !oid) return null
  try {
    const { rows } = await pool.query(
      `SELECT order_id, user_id, player_id, link, provider, match, bet, item,
              odds, bet_money, money, status, create_at
       FROM orders WHERE user_id = $1 AND order_id = $2
       LIMIT 1`,
      [uid, oid],
    )
    return rows?.[0] ?? null
  } catch (err) {
    console.warn('[rds] fetchOrderByOrderId:', err.message)
    return null
  }
}

async function fetchUserByName(userName) {
  const pool = getPgPool()
  const name = String(userName || '').trim()
  if (!pool || !name) return null
  try {
    const { rows } = await pool.query(
      `SELECT id, user_name FROM users WHERE lower(user_name) = lower($1) LIMIT 1`,
      [name],
    )
    return rows?.[0] ?? null
  } catch (err) {
    console.warn('[rds] fetchUserByName:', err.message)
    return null
  }
}

async function fetchUserById(userId) {
  const pool = getPgPool()
  const uid = String(userId || '').trim()
  if (!pool || !uid) return null
  try {
    const { rows } = await pool.query(
      `SELECT id, user_name FROM users WHERE id = $1 LIMIT 1`,
      [uid],
    )
    return rows?.[0] ?? null
  } catch (err) {
    console.warn('[rds] fetchUserById:', err.message)
    return null
  }
}

/** 管理端：当日订单汇总（不含 PB hash 占位单） */
async function fetchOrdersAdminStats(dateKey) {
  const { dayStart, dayEnd } = localDayBounds(dateKey)
  const pool = getPgPool()
  if (!pool) return { count: 0, money: 0, betMoney: 0 }
  try {
    const { rows } = await pool.query(
      `SELECT money, bet_money, status FROM orders WHERE create_at >= $1 AND create_at < $2 AND ${SQL_NON_EXT}`,
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

/** 管理端：分页订单（不含 PB hash 占位单） */
async function fetchOrdersAdminPage({
  dateKey,
  userId,
  provider,
  pageIndex,
  pageSize,
}) {
  const { dayStart, dayEnd } = localDayBounds(dateKey)
  const from = (Math.max(1, pageIndex) - 1) * pageSize
  const pool = getPgPool()
  if (!pool) return { rows: [], total: 0 }
  try {
    const params = [dayStart, dayEnd]
    let where = `create_at >= $1 AND create_at < $2 AND ${SQL_NON_EXT}`
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

/** 管理端：按主键 id 删除订单 */
async function deleteOrdersByIds(ids) {
  if (!Array.isArray(ids) || !ids.length) return 0
  const pool = getPgPool()
  if (!pool) return 0
  const clean = ids
    .map((id) => Number(id))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (!clean.length) return 0
  try {
    const res = await pool.query('DELETE FROM orders WHERE id = ANY($1::bigint[])', [clean])
    return res.rowCount ?? 0
  } catch (err) {
    console.warn('[rds] deleteOrdersByIds:', err.message)
    return 0
  }
}

/** 管理端：当日全量订单（对阵矩阵，上限 5000 条；不含 PB hash 占位单） */
async function fetchOrdersAdminAll({ dateKey, provider, limit = 5000 }) {
  const { dayStart, dayEnd } = localDayBounds(dateKey)
  const cap = Math.min(5000, Math.max(1, Number(limit) || 5000))
  const pool = getPgPool()
  if (!pool) return []
  try {
    const params = [dayStart, dayEnd]
    let where = `create_at >= $1 AND create_at < $2 AND ${SQL_NON_EXT}`
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

/** 月报：读取指定月份订单聚合字段；可选 user_id 筛选（不含 PB hash 占位单） */
async function fetchOrdersForMonthAggregate(monthKey, userId) {
  const { monthStart, monthEnd } = localMonthBounds(monthKey)
  const pool = getPgPool()
  if (!pool) return []
  try {
    const params = [monthStart, monthEnd]
    let sql = `SELECT create_at, money, bet_money, status FROM orders WHERE create_at >= $1 AND create_at < $2 AND ${SQL_NON_EXT}`
    if (userId) {
      params.push(String(userId))
      sql += ` AND user_id = $${params.length}`
    }
    const { rows } = await pool.query(sql, params)
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchOrdersForMonthAggregate:', err.message)
    return []
  }
}

/** 排行榜：按本地自然日读取订单盈利聚合字段（不含 PB hash 占位单） */
async function fetchOrdersForProfitAggregate(dateKey) {
  const { dayStart, dayEnd } = localDayBounds(dateKey)
  const pool = getPgPool()
  if (!pool) return []
  try {
    const { rows } = await pool.query(
      `SELECT user_id, money, bet_money, status FROM orders WHERE create_at >= $1 AND create_at < $2 AND ${SQL_NON_EXT}`,
      [dayStart, dayEnd],
    )
    return rows || []
  } catch (err) {
    console.warn('[rds] fetchOrdersForProfitAggregate:', err.message)
    return []
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
    const matchParams = [String(userId), String(orderId)]
    let where = "user_id = $1 AND order_id = $2"
    if (Number.isFinite(playerId) && playerId > 0) {
      matchParams.push(playerId)
      where += ` AND player_id = $${matchParams.length}`
    } else if (provider) {
      matchParams.push(provider)
      where += ` AND provider = $${matchParams.length}`
    }
    const sel = await pool.query(`SELECT * FROM orders WHERE ${where}`, matchParams)
    const prev = sel.rows?.[0]
    if (!prev) return false
    const res = await pool.query(
      `UPDATE orders SET link = $1 WHERE ${where}`,
      [linkVal, ...matchParams],
    )
    if (
      res.rowCount > 0 &&
      _isExternalOrderLink(prev.link) &&
      !_isExternalOrderLink(linkVal) &&
      _ordersBoundHook
    ) {
      try {
        _ordersBoundHook([{ ...prev, link: linkVal }])
      } catch (hookErr) {
        console.warn('[rds] ordersBoundHook:', hookErr.message)
      }
    }
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
  updateUserName,
  updateUserIsAdmin,
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
  writeLiveTimersAsync,
  purgePlatformLiveTimers,
  fetchOrdersByDate,
  fetchOrdersByPlayer,
  fetchOrdersByPlayerAll,
  fetchOrdersByLink,
  fetchOrderByOrderId,
  fetchUserByName,
  fetchUserById,
  fetchProfilesAdmin,
  fetchOrdersAdminStats,
  fetchOrdersAdminPage,
  deleteOrdersByIds,
  fetchOrdersAdminAll,
  fetchOrdersForMonthAggregate,
  fetchMoneyLogsForMonthAggregate,
  fetchOrdersForProfitAggregate,
  fetchMoneyLogsByPlayer,
  fetchMoneyLogById,
  fetchAllMoneyLogs,
  upsertMoneyLog,
  deleteMoneyLogById,
  deleteMoneyLogsByPlayer,
  fetchTagPlatforms,
  upsertTagPlatformByName,
  insertPlayerRow,
  fetchPlayerById,
  updatePlayerBalanceRow,
  insertUserLogRow,
  fetchUserLogsInRange,
  softDeletePlayerRow,
  upsertOrders,
  setOrdersInsertedHook,
  setOrdersBoundHook,
  updateOrderBind,
  authSignIn,
  authSignOut,
  authGetUser,
  authRefreshToken,
  writeUserMetadata,
};
