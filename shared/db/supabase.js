'use strict'

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

const { supabase, supabaseAdmin } = require('./client.js')

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

/** 从 Supabase 读取 client_matches，按 start_time 升序排列 */
async function fetchClientMatches() {
  const client = supabaseAdmin || supabase
  if (!client) return null
  try {
    const { data, error } = await client
      .from('client_matches')
      .select('*')
      .order('start_time', { ascending: true })
    if (error || !data?.length) return null
    return data
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
    .select('platform,source_bet_id,source_match_id,map,bet_name,group_name,source_home_id,source_away_id,home_odds,away_odds,is_locked')
  if (error || !data?.length) return {}
  const byKey = {}
  for (const r of data) {
    const key = `${r.platform}:${r.source_match_id}`
    if (!byKey[key]) byKey[key] = { provider: r.platform, matchId: r.source_match_id, bets: [], savedAt: 0 }
    byKey[key].bets.push({
      SourceBetID:  r.source_bet_id,
      BetName:      r.bet_name ?? '',
      GroupName:    r.group_name ?? '',
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

/** fire-and-forget：upsert 平台盘口赔率（只保最新） */
function writePlatformBets(provider, matchId, bets) {
  if (!Array.isArray(bets) || !bets.length) return
  const now = Date.now()
  const rawRows = bets
    .filter((b) => b && b.SourceBetID != null && !String(b.BetName ?? '').includes('+'))
    .map((b) => ({
      platform:        String(provider),
      source_bet_id:   String(b.SourceBetID),
      source_match_id: String(matchId),
      map:             Number(b.Map ?? 0),
      bet_name:        String(b.BetName || ''),
      group_name:      String(b.GroupName ?? b.group_name ?? '') || null,
      source_home_id:  String(b.SourceHomeID ?? b.source_home_id ?? '') || null,
      source_away_id:  String(b.SourceAwayID ?? b.source_away_id ?? '') || null,
      home_odds:       Number(b.HomeOdds) || 0,
      away_odds:       Number(b.AwayOdds) || 0,
      is_locked:       b.Status !== 'Normal',
      updated_at:      now,
    }))
  if (!rawRows.length) return
  const seen = new Map()
  for (const row of rawRows) seen.set(`${row.source_match_id}:${row.source_bet_id}`, row)
  const rows = [...seen.values()]
  _write(async (client) => {
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

/** 更新订单 link 绑定 */
async function updateOrderBind(orderId, playerId, userId, link) {
  if (!supabaseAdmin) return
  await supabaseAdmin.from('orders')
    .update({ link: Number(link) || 0 })
    .eq('user_id',   String(userId))
    .eq('order_id',  String(orderId))
    .eq('player_id', Number(playerId))
}

// ── auth ──────────────────────────────────────────────────────────────

/** 密码登录；返回 { accessToken, refreshToken, userId, email } 或 null */
async function authSignIn(userName, password) {
  if (!supabase) return null
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${userName.toLowerCase()}@gamebet.local`,
    password,
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
  if (!supabase || !token) return
  await supabase.auth.admin.signOut(token).catch(() => {})
}

/** 校验 JWT token；返回 { userId, metadata } 或 null */
async function authGetUser(token) {
  if (!supabase || !token) return null
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return {
      userId:   data.user.id,
      metadata: data.user.user_metadata || {},
    }
  } catch { return null }
}

/** 写入 user_metadata（fire-and-forget，用于单 session 限制） */
function writeUserMetadata(userId, metadata) {
  if (!supabaseAdmin) return
  Promise.resolve()
    .then(() => supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: metadata }))
    .catch((err) => console.warn('[supabase] writeUserMetadata:', err.message))
}

/** service_role 可用时返回 true */
function hasAdminAccess() {
  return !!supabaseAdmin
}

/** 是否已配置 Supabase Auth（登录必需） */
function isAuthConfigured() {
  return !!supabase
}

/** 写入 client_matches / matcher 使用的 Supabase 客户端 */
function getServiceClient() {
  return supabaseAdmin || supabase
}

module.exports = {
  hasAdminAccess,
  isAuthConfigured,
  getServiceClient,
  // profiles
  fetchProfiles,
  fetchProfileById,
  writeProfile,
  insertProfile,
  // accounts
  writeAccounts,
  // client_matches
  writeClientMatches,
  writeClientMatchesAsync,
  fetchClientMatches,
  initLastWrittenIds,
  clearClientMatchesOnStartup,
  // platform_matches / platform_bets / live_timers
  fetchPlatformMatches,
  fetchPlatformBets,
  fetchLiveTimers,
  writePlatformMatches,
  writePlatformBets,
  writeLiveTimers,
  // orders
  fetchOrdersByDate,
  fetchOrdersByPlayer,
  upsertOrders,
  updateOrderBind,
  // auth
  authSignIn,
  authSignOut,
  authGetUser,
  writeUserMetadata,
}
