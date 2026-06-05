'use strict'

/**
 * Supabase 表操作层 — 项目所有 Supabase 读写集中于此。
 *
 * 命名约定：
 *   fetch*  — async 读取，返回数据或 null/[]
 *   write*  — fire-and-forget 写入，不阻塞调用方
 *   upsert* — async 写入，需要确认结果
 */

const { supabase, supabaseAdmin } = require('./client.js')

// 用户登录后设为 true，登出后设为 false
// _write 只在有活跃 session 时执行，避免登录前以 anon 身份写入
let _hasSession = false

/**
 * fire-and-forget 写入：仅在用户已登录（_hasSession = true）时执行。
 * 登录前（anon 状态）跳过写入，避免 permission denied 刷屏。
 */
function _write(fn) {
  if (!supabase || !_hasSession) return
  Promise.resolve().then(() => fn(supabase)).catch((err) => console.warn('[supabase]', err.message))
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
  })
}

// ── accounts ──────────────────────────────────────────────────────────

/** fire-and-forget：替换用户账号列表 */
function writeAccounts(uid, accounts) {
  _write(async (client) => {
    const { error } = await client.from('profiles')
      .update({ accounts, updated_at: Date.now() }).eq('id', String(uid))
    if (error) throw error
  })
}

// ── client_matches ────────────────────────────────────────────────────

/** fire-and-forget：upsert 客户端比赛列表，同时删除不再活跃的旧行 */
function writeClientMatches(rows) {
  if (!Array.isArray(rows) || !rows.length) return
  const activeIds = rows.map((r) => Number(r.id))
  _write(async (client) => {
    const { error } = await client.from('client_matches')
      .upsert(rows, { onConflict: 'id' })
    if (error) throw error
    const { error: delErr } = await client.from('client_matches')
      .delete()
      .not('id', 'in', `(${activeIds.join(',')})`)
    if (delErr) throw delErr
  })
}

/** 启动时清空 client_matches（清除旧模式遗留数据），用 service_role 无需登录 */
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
  if (!supabase) return null
  try {
    const { data, error } = await supabase
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
  const activeIds = rows.map((r) => r.source_match_id)
  _write(async (client) => {
    const { error } = await client
      .from('platform_matches')
      .upsert(rows, { onConflict: 'platform,source_match_id' })
    if (error) throw error
    // 当前列表里没有的行 = 比赛已结束，删除
    const { error: delErr } = await client
      .from('platform_matches')
      .delete()
      .eq('platform', String(provider))
      .not('source_match_id', 'in', `(${activeIds.join(',')})`)
    if (delErr) throw delErr
  })
}

// ── platform_bets ─────────────────────────────────────────────────────

/** fire-and-forget：upsert 平台盘口赔率（只保最新） */
function writePlatformBets(provider, matchId, bets) {
  if (!Array.isArray(bets) || !bets.length) return
  const now = Date.now()
  const rows = bets
    .filter((b) => b && b.SourceBetID != null && !String(b.BetName ?? '').includes('+'))
    .map((b) => ({
      platform:        String(provider),
      source_bet_id:   String(b.SourceBetID),
      source_match_id: String(matchId),
      map:             Number(b.Map ?? 0),
      bet_name:        String(b.BetName || ''),
      home_odds:       Number(b.HomeOdds) || 0,
      away_odds:       Number(b.AwayOdds) || 0,
      is_locked:       b.Status !== 'Normal',
      updated_at:      now,
    }))
  if (!rows.length) return
  _write(async (client) => {
    const { error } = await client
      .from('platform_bets')
      .upsert(rows, { onConflict: 'platform,source_bet_id' })
    if (error) throw error
  })
}

// ── live_timers ───────────────────────────────────────────────────────

/** fire-and-forget：upsert 比赛计时器（只保最新） */
function writeLiveTimers(provider, timer) {
  if (!Array.isArray(timer) || !timer.length) return
  const now = Date.now()
  const rows = timer
    .filter((t) => t && t.MatchID != null)
    .map((t) => ({
      platform:        String(provider),
      source_match_id: String(t.MatchID),
      round:           Number(t.Round) || 0,
      round_start:     Number(t.StartTime) || null,
      updated_at:      now,
    }))
  if (!rows.length) return
  _write(async (client) => {
    const { error } = await client
      .from('live_timers')
      .upsert(rows, { onConflict: 'platform,source_match_id' })
    if (error) throw error
  })
}

// ── orders ────────────────────────────────────────────────────────────

/** 按日期读取订单（userId 隔离） */
async function fetchOrdersByDate(date, userId) {
  if (!supabase || !userId) return []
  const dayStart = new Date(date).getTime()
  const dayEnd   = dayStart + 86400000
  const { data, error } = await supabase
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
  if (!supabase || !userId) return []
  const { data, error } = await supabase
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
  if (!supabase || !rows?.length) return false
  const { error } = await supabase
    .from('orders')
    .upsert(rows, { onConflict: 'user_id,order_id,player_id', ignoreDuplicates: false })
  if (error) { console.warn('[supabase] upsertOrders:', error.message); return false }
  return true
}

/** 更新订单 link 绑定 */
async function updateOrderBind(orderId, playerId, userId, link) {
  if (!supabase) return
  await supabase.from('orders')
    .update({ link: Number(link) || 0 })
    .eq('user_id',   String(userId))
    .eq('order_id',  String(orderId))
    .eq('player_id', Number(playerId))
}

// ── auth ──────────────────────────────────────────────────────────────

/** 密码登录；返回 { accessToken, userId, email } 或 null */
async function authSignIn(userName, password) {
  if (!supabase) return null
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${userName.toLowerCase()}@gamebet.local`,
    password,
  })
  if (error || !data?.session) return null
  _hasSession = true
  return {
    accessToken: data.session.access_token,
    userId: data.user.id,
    email: data.user.email,
  }
}

/** 登出指定 token 对应的 session */
async function authSignOut(token) {
  _hasSession = false
  if (!supabase || !token) return
  await supabase.auth.admin.signOut(token).catch(() => {})
}

/**
 * 校验 JWT token；返回 { userId, metadata } 或 null。
 * metadata 包含 active_session_id 等 user_metadata 字段。
 */
async function authGetUser(token) {
  if (!supabase || !token) return null
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return {
      userId: data.user.id,
      metadata: data.user.user_metadata || {},
    }
  } catch { return null }
}

/** 写入 user_metadata（fire-and-forget，用于单 session 限制）
 *  需要 service_role，无 supabaseAdmin 时静默跳过 */
function writeUserMetadata(userId, metadata) {
  if (!supabaseAdmin) return
  Promise.resolve()
    .then(() => supabaseAdmin.auth.admin.updateUserById(userId, { user_metadata: metadata }))
    .catch((err) => console.warn('[supabase] writeUserMetadata:', err.message))
}

/** 在 profiles 表中创建新用户行（首次登录触发器未执行时的兜底） */
async function insertProfile(uid, data) {
  if (!supabaseAdmin) return false
  const { error } = await supabaseAdmin.from('profiles').insert(data)
  return !error
}

/** service_role 可用时返回 true，用于判断是否能执行 admin 操作（单 session 校验等） */
function hasAdminAccess() {
  return !!supabaseAdmin
}

module.exports = {
  hasAdminAccess,
  // profiles
  fetchProfiles,
  fetchProfileById,
  writeProfile,
  insertProfile,
  // accounts
  writeAccounts,
  // client_matches
  writeClientMatches,
  fetchClientMatches,
  clearClientMatchesOnStartup,
  // platform_matches / platform_bets / live_timers
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
