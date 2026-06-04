'use strict'

/**
 * Supabase 表操作层 — 项目所有 Supabase 读写集中于此。
 *
 * 命名约定：
 *   fetch*  — async 读取，返回数据或 null/[]
 *   write*  — fire-and-forget 写入，不阻塞调用方
 *   upsert* — async 写入，需要确认结果
 */

const { supabase } = require('./client.js')

/** fire-and-forget：失败只打 warn，不影响主流程 */
function _write(fn) {
  if (!supabase) return
  Promise.resolve().then(fn).catch((err) => console.warn('[supabase]', err.message))
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
  _write(async () => {
    const { error } = await supabase.from('profiles')
      .update({ ...patch, updated_at: Date.now() }).eq('id', String(uid))
    if (error) throw error
  })
}

// ── accounts ──────────────────────────────────────────────────────────

/** fire-and-forget：替换用户账号列表 */
function writeAccounts(uid, accounts) {
  _write(async () => {
    const { error } = await supabase.from('profiles')
      .update({ accounts, updated_at: Date.now() }).eq('id', String(uid))
    if (error) throw error
  })
}

// ── ob_matches ────────────────────────────────────────────────────────

/** fire-and-forget：upsert OB 比赛列表 */
function writeObMatches(rows) {
  _write(async () => {
    const { error } = await supabase.from('ob_matches')
      .upsert(rows, { onConflict: 'source_match_id' })
    if (error) throw error
  })
}

/** fire-and-forget：删除不在 activeIds 中的 OB 比赛 */
function deleteObMatches(activeIds) {
  _write(async () => {
    if (!activeIds?.length) {
      await supabase.from('ob_matches').delete().neq('source_match_id', '')
    } else {
      await supabase.from('ob_matches').delete()
        .not('source_match_id', 'in', `(${activeIds.map((id) => `"${id}"`).join(',')})`)
    }
  })
}

// ── client_matches ────────────────────────────────────────────────────

/** fire-and-forget：upsert 客户端比赛列表 */
function writeClientMatches(rows) {
  _write(async () => {
    const { error } = await supabase.from('client_matches')
      .upsert(rows, { onConflict: 'id' })
    if (error) throw error
  })
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
  return {
    accessToken: data.session.access_token,
    userId: data.user.id,
    email: data.user.email,
  }
}

/** 登出指定 token 对应的 session */
async function authSignOut(token) {
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

/** 写入 user_metadata（fire-and-forget，用于单 session 限制） */
function writeUserMetadata(userId, metadata) {
  _write(async () => {
    await supabase.auth.admin.updateUserById(userId, { user_metadata: metadata })
  })
}

/** 在 profiles 表中创建新用户行（首次登录触发器未执行时的兜底） */
async function insertProfile(uid, data) {
  if (!supabase) return false
  const { error } = await supabase.from('profiles').insert(data)
  return !error
}

module.exports = {
  // profiles
  fetchProfiles,
  fetchProfileById,
  writeProfile,
  insertProfile,
  // accounts
  writeAccounts,
  // ob_matches
  writeObMatches,
  deleteObMatches,
  // client_matches
  writeClientMatches,
  fetchClientMatches,
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
