/**
 * Supabase 表操作层 — 项目所有 Supabase 读写集中于此。
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

function getPgPool() {
  if (!isJwtMode()) return null;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!_pgPool) {
    const { Pool } = requirePg();
    _pgPool = new Pool({ connectionString: url, max: 4 });
    console.log("[db] AUTH_MODE=jwt，RDS 连接池已就绪");
  }
  return _pgPool;
}

if (isJwtMode()) {
  console.log("[db] AUTH_MODE=jwt（登录走 RDS users 表；数据读写仍按现有 Supabase 路径，直至 M3）");
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

// ── profiles ──────────────────────────────────────────────────────────

/** 拉取所有 profiles 到内存（启动时调用） */
async function fetchProfiles(sessionClient) {
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
  if (isJwtMode()) {
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
  _write(async (client) => {
    const { error } = await client.from('profiles')
      .update({ ...patch, updated_at: Date.now() }).eq('id', String(uid))
    if (error) throw error
  }, 'profiles')
}

/** 在 profiles 表中创建新用户行（首次登录触发器未执行时的兜底） */
async function insertProfile(uid, data) {
  if (isJwtMode()) {
    const pool = getPgPool();
    if (!pool) return false;
    try {
      await pool.query(
        `INSERT INTO profiles (id, user_name, accounts, betting_config, collect_config, preferences, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          String(data.id || uid),
          String(data.user_name || ""),
          data.accounts ?? [],
          data.betting_config ?? {},
          data.collect_config ?? {},
          data.preferences ?? {},
          Number(data.created_at) || Date.now(),
          Number(data.updated_at) || Date.now(),
        ],
      );
      return true;
    } catch (err) {
      console.warn("[rds] insertProfile:", err.message);
      return false;
    }
  }
  if (!supabaseAdmin) return false
  const { error } = await supabaseAdmin.from('profiles').insert(data)
  return !error
}

// ── accounts ──────────────────────────────────────────────────────────

/** fire-and-forget：替换用户账号列表 */
function writeAccounts(uid, accounts) {
  _write(async (client) => {
    const { error } = await client.from('profiles')
      .update({ accounts, updated_at: Date.now() }).eq('id', String(uid))
    if (error) throw error
  }, 'accounts')
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
  _write((client) => _upsertClientMatches(client, dedupedRows, toDelete), 'client_matches')
}

/** await 写入完成（matcher / rebuild 使用，避免前端读到上一版） */
async function writeClientMatchesAsync(rows) {
  if (!supabaseAdmin) {
    writeClientMatches(rows)
    return
  }
  const prepared = _prepareClientMatchWrite(rows)
  if (!prepared) return
  const { dedupedRows, toDelete } = prepared
  await _upsertClientMatches(supabaseAdmin, dedupedRows, toDelete)
}

/** 启动时从 Supabase 预填 _lastWrittenIds，使差量删除能覆盖上次遗留行 */
async function initLastWrittenIds() {
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
  const client = supabaseAdmin || supabase
  if (!client) return
  try {
    await client.from('client_matches').delete().neq('id', 0)
  } catch (err) {
    console.warn('[supabase] clearClientMatchesOnStartup 失败:', err.message)
  }
}

/**
 * 轻量探测 client_matches 是否变化（供 backend 快照缓存失效，避免每次 Client_GetMatchs 全表 SELECT *）。
 * @returns {Promise<{ builtAt: number, count: number }|null>} 失败时 null
 */
async function fetchClientMatchesMeta() {
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

/** fire-and-forget：upsert 平台原始比赛列表，同时删除该平台已结束的旧行 */
function writePlatformMatches(provider, matchs) {
  if (!Array.isArray(matchs) || !matchs.length) return
  const now = Date.now()
  // match_id 由 matcher rebuild（队伍 ID 自动合并）或人工关联回填；SaveMatch 不写，避免 FK 指向不存在的 client_matches.id
  const rows = matchs.map((m) => ({
    platform:        String(provider),
    source_match_id: String(m.SourceMatchID),
    source_game_id:  m.SourceGameID != null ? String(m.SourceGameID) : null,
    start_time:      Number(m.StartTime) || null,
    home_id:         m.HomeID != null ? String(m.HomeID) : null,
    home:            String(m.Home || ''),
    away_id:         m.AwayID != null ? String(m.AwayID) : null,
    away:            String(m.Away || ''),
    bo:              m.BO != null ? Number(m.BO) : null,
    teams:           Array.isArray(m.Teams) ? m.Teams : [],
    synced_at:       now,
  }))
  _write(async (client) => {
    const { error } = await client
      .from('platform_matches')
      .upsert(rows, { onConflict: 'platform,source_match_id' })
    if (error) throw error
    // 过期行由 pg_cron 每小时清理（synced_at > 2h），不在写入路径显式 delete
  }, 'platform_matches')
}

/** 启动时从 Supabase 读取 platform_matches，按平台分组，返回可直接传给 store.saveMatches 的格式 */
async function fetchPlatformMatches() {
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
  _write(async (client) => {
    const { error } = await client
      .from('platform_bets')
      .upsert(rows, { onConflict: 'platform,source_match_id,source_bet_id' })
    if (error) throw error
  }, 'platform_bets')
}

/** [A8 可证实] 每场 saveBets 为完整快照：先删该场旧行再 upsert */
function replacePlatformBetsForMatch(provider, matchId, bets) {
  const rows = mapSaveBetRows(provider, matchId, bets)
  if (!rows.length) return
  const plat = String(provider)
  const mid = String(matchId)
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
  _write(async (client) => {
    const { error } = await client
      .from('live_timers')
      .upsert(rows, { onConflict: 'platform,source_match_id' })
    if (error) throw error
  }, 'live_timers')
}

// ── orders ────────────────────────────────────────────────────────────

/** 服务端读 orders：须用 service_role（无用户 JWT 时 anon+RLS 恒为空） */
function ordersReadClient() {
  return supabaseAdmin || supabase
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
  const client = ordersReadClient()
  if (!client || !userId) return []
  const { dayStart, dayEnd } = localDayBounds(date)
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
  if (!supabaseAdmin || !rows?.length) return false
  const { error } = await supabaseAdmin
    .from('orders')
    .upsert(rows, { onConflict: 'user_id,order_id,player_id', ignoreDuplicates: false })
  if (error) { console.warn('[supabase] upsertOrders:', error.message); return false }
  return true
}

/** 管理端：全量 profiles 摘要 */
async function fetchProfilesAdmin() {
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
  const client = ordersReadClient()
  if (!client) return { count: 0, money: 0, betMoney: 0 }
  const { dayStart, dayEnd } = localDayBounds(dateKey)
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
  const client = ordersReadClient()
  if (!client) return { rows: [], total: 0 }
  const { dayStart, dayEnd } = localDayBounds(dateKey)
  const from = (Math.max(1, pageIndex) - 1) * pageSize
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
  const client = ordersReadClient()
  if (!client) return []
  const { dayStart, dayEnd } = localDayBounds(dateKey)
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
  if (!supabaseAdmin || !orderId || !userId) return false
  const playerId = Number(opts.playerId)
  const provider = opts.provider ? String(opts.provider) : ''
  let q = supabaseAdmin
    .from('orders')
    .update({ link: Number(link) || 0 })
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
  if (isJwtMode()) return !!getPgPool()
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
