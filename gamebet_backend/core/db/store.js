'use strict'

const sb = require('../../../shared/db/supabase.js')

// ─── 内存 profile 缓存 ───────────────────────────────────────────────
const _cache = new Map()

function _set(uid, row) { _cache.set(String(uid), row) }
function _get(uid)       { return _cache.get(String(uid)) || null }

function _toProfile(row) {
  if (!row) return null
  let setting = {}
  try {
    const bc = row.betting_config
    setting = typeof bc === 'object' && bc !== null ? bc : JSON.parse(bc || '{}')
  } catch {}
  return { id: String(row.id), userName: row.user_name, setting }
}

// ─── profiles ────────────────────────────────────────────────────────

function getProfileById(uid) { return _toProfile(_get(uid)) }

function getProfileByName(userName) {
  for (const row of _cache.values()) {
    if (row.user_name === userName) return _toProfile(row)
  }
  return null
}

function listProfiles() {
  return [..._cache.values()].map(_toProfile).filter(Boolean)
}

function upsertProfile(profile) {
  const uid = String(profile.id)
  const existing = _get(uid) || {}
  _set(uid, {
    ...existing,
    id: uid,
    user_name:      String(profile.userName || profile.user_name || existing.user_name || ''),
    accounts:       profile.accounts       ?? existing.accounts       ?? [],
    betting_config: profile.betting_config ?? existing.betting_config ?? {},
    collect_config: profile.collect_config ?? existing.collect_config ?? {},
    preferences:    profile.preferences    ?? existing.preferences    ?? {},
    created_at: profile.created_at || existing.created_at || Date.now(),
    updated_at: Date.now(),
  })
}

function updateProfileSetting(uid, patch) {
  const row = _get(uid) || {}
  const bc = typeof row.betting_config === 'object' && row.betting_config !== null
    ? { ...row.betting_config } : {}
  Object.assign(bc, patch || {})
  const now = Date.now()
  _set(uid, { ...row, betting_config: bc, updated_at: now })
  sb.writeProfile(uid, { betting_config: bc })
  return getProfileById(uid)
}

async function loadProfileById(uid) {
  const data = await sb.fetchProfileById(uid)
  if (!data) return null
  _set(data.id, data)
  return _toProfile(data)
}

async function pullFromSupabase(sessionClient) {
  const profiles = await sb.fetchProfiles(sessionClient)
  if (profiles.length) {
    for (const p of profiles) _set(p.id, p)
    console.log('[db:supabase] 加载 profiles:', profiles.length, '条')
  }
}

// ─── accounts ────────────────────────────────────────────────────────

function listAccountsForUser(uid) {
  const row = _get(uid)
  if (!row) return []
  const a = row.accounts
  if (Array.isArray(a)) return a
  try { return JSON.parse(a || '[]') } catch { return [] }
}

function countAccounts() {
  return [..._cache.values()].reduce((s, r) => s + (Array.isArray(r.accounts) ? r.accounts.length : 0), 0)
}

function replaceAccountsForUser(uid, accounts) {
  const row = _get(uid) || {}
  _set(uid, { ...row, accounts, updated_at: Date.now() })
  sb.writeAccounts(uid, accounts)
  return listAccountsForUser(uid)
}

function updateAccountForUser(uid, accountId, updates) {
  const accounts = listAccountsForUser(uid)
  const idx = accounts.findIndex((a) => String(a.accountId) === String(accountId))
  if (idx < 0) return null
  accounts[idx] = { ...accounts[idx], ...updates, updateTime: Date.now() }
  replaceAccountsForUser(uid, accounts)
  return accounts[idx]
}

function removeAccountForUser(uid, accountId) {
  const accounts = listAccountsForUser(uid)
  const next = accounts.filter((a) => String(a.accountId) !== String(accountId))
  if (next.length === accounts.length) return false
  replaceAccountsForUser(uid, next)
  return true
}

// ─── user_settings ───────────────────────────────────────────────────

function _colForKey(key) {
  if (key === 'USERCONFIG')    return 'betting_config'
  if (key === 'CollectConfig') return 'collect_config'
  return 'preferences'
}

function setUserSetting(uid, key, content) {
  const col = _colForKey(key)
  const row = _get(uid) || {}
  const now = Date.now()
  if (col !== 'preferences') {
    let parsed = {}
    try { parsed = JSON.parse(String(content ?? '{}')) } catch {}
    _set(uid, { ...row, [col]: parsed, updated_at: now })
    sb.writeProfile(uid, { [col]: parsed })
  } else {
    const prefs = typeof row.preferences === 'object' && row.preferences !== null
      ? { ...row.preferences } : {}
    prefs[String(key)] = String(content ?? '')
    _set(uid, { ...row, preferences: prefs, updated_at: now })
    sb.writeProfile(uid, { preferences: prefs })
  }
}

function getUserSetting(uid, key) {
  const col = _colForKey(key)
  const row = _get(uid)
  if (!row) return null
  if (col !== 'preferences') {
    const val = row[col]
    if (!val || (typeof val === 'object' && !Object.keys(val).length)) return null
    return typeof val === 'string' ? val : JSON.stringify(val)
  }
  const prefs = row.preferences || {}
  const val = typeof prefs === 'object' ? prefs[String(key)] : null
  return val != null ? String(val) : null
}

function countUserSettings() { return 0 }

// ─── client_matches（内存）───────────────────────────────────────────

const _clientMatches = new Map()

function saveClientMatches(info) {
  if (!Array.isArray(info) || !info.length) return
  const now = Date.now()
  _clientMatches.clear()
  for (const m of info) _clientMatches.set(Number(m.ID), { ...m, built_at: now })
  sb.writeClientMatches(info.map((m) => ({
    id: Number(m.ID),
    merge_key: m.MergeKey ? String(m.MergeKey) : null,
    title: String(m.Title || ''), game: String(m.Game || ''),
    game_id: String(m.GameID || ''), start_time: Number(m.StartTime) || 0,
    bo: Number(m.BO) || 0, round: Number(m.Round) || 0, round_start: Number(m.RoundStart) || 0,
    reverse: Array.isArray(m.Reverse) ? m.Reverse : [],
    matchs: m.Matchs || {}, bets: m.Bets || [], built_at: now,
  })))
}

function pruneClientMatches(activeIds) {
  if (!activeIds?.length) { _clientMatches.clear(); return }
  const active = new Set(activeIds.map(Number))
  for (const id of _clientMatches.keys()) {
    if (!active.has(id)) _clientMatches.delete(id)
  }
}

function getClientMatches() {
  if (!_clientMatches.size) return null
  return [..._clientMatches.values()]
    .sort((a, b) => (a.StartTime || 0) - (b.StartTime || 0))
}

/** 从 Supabase 加载 client_matches（每次请求刷新，matcher 写入后前端轮询能拿到最新盘口） */
async function loadClientMatchesFromSupabase() {
  const data = await sb.fetchClientMatches()
  // null = 查询失败，暂用内存兜底；[] = 库确认为空，清掉遗留内存（避免 pg_cron 删库后仍返回旧列表）
  if (data === null) return _clientMatches.size ? getClientMatches() : null
  if (!data.length) {
    _clientMatches.clear()
    return null
  }
  const now = Date.now()
  _clientMatches.clear()
  for (const row of data) {
    _clientMatches.set(Number(row.id), {
      ID: row.id, Title: row.title || '', Game: row.game || '',
      GameID: row.game_id || '', StartTime: row.start_time || 0,
      BO: row.bo || 0, Round: row.round || 0, RoundStart: row.round_start || 0,
      Reverse: Array.isArray(row.reverse) ? row.reverse : [],
      Matchs: row.matchs || {}, Bets: row.bets || [],
      built_at: row.built_at || now,
    })
  }
  return getClientMatches()
}

module.exports = {
  getProfileById, getProfileByName, upsertProfile, listProfiles, updateProfileSetting,
  loadProfileById, pullFromSupabase,
  listAccountsForUser, countAccounts, replaceAccountsForUser,
  updateAccountForUser, removeAccountForUser,
  setUserSetting, getUserSetting, countUserSettings,
  saveClientMatches, pruneClientMatches, getClientMatches, loadClientMatchesFromSupabase,
}
