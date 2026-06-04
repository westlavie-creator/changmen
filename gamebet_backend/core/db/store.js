'use strict'

const { supabase } = require('./client')

// ─── Supabase 异步写（fire-and-forget）──────────────────────────────
function _sb(fn) {
  if (!supabase) return
  Promise.resolve().then(fn).catch((err) => console.warn('[db:supabase]', err.message))
}

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

function getProfileById(uid) {
  return _toProfile(_get(uid))
}

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
    user_name: String(profile.userName || profile.user_name || existing.user_name || ''),
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
  _sb(async () => {
    const { error } = await supabase.from('profiles')
      .update({ betting_config: bc, updated_at: now }).eq('id', String(uid))
    if (error) throw error
  })
  return getProfileById(uid)
}

async function loadProfileById(uid) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', String(uid)).single()
    if (error || !data) return null
    _set(data.id, data)
    return _toProfile(data)
  } catch { return null }
}

async function pullFromSupabase(sessionClient) {
  const client = sessionClient || supabase
  if (!client) return
  try {
    const { data: profiles, error } = await client.from('profiles').select('*')
    if (error) throw error
    if (profiles?.length) {
      for (const p of profiles) _set(p.id, p)
      console.log('[db:supabase] 加载 profiles:', profiles.length, '条')
    }
  } catch (err) {
    console.error('[db:supabase] 加载失败:', err.message)
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
  const now = Date.now()
  _set(uid, { ...row, accounts, updated_at: now })
  _sb(async () => {
    const { error } = await supabase.from('profiles')
      .update({ accounts, updated_at: now }).eq('id', String(uid))
    if (error) throw error
  })
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
    _sb(async () => {
      const { error } = await supabase.from('profiles')
        .update({ [col]: parsed, updated_at: now }).eq('id', String(uid))
      if (error) throw error
    })
  } else {
    const prefs = typeof row.preferences === 'object' && row.preferences !== null
      ? { ...row.preferences } : {}
    prefs[String(key)] = String(content ?? '')
    _set(uid, { ...row, preferences: prefs, updated_at: now })
    _sb(async () => {
      const { error } = await supabase.from('profiles')
        .update({ preferences: prefs, updated_at: now }).eq('id', String(uid))
      if (error) throw error
    })
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

// ─── ob_matches（内存）────────────────────────────────────────────────

const _obMatches = new Map() // source_match_id → raw object

function saveObMatches(matches) {
  if (!Array.isArray(matches) || !matches.length) return
  const now = Date.now()
  for (const m of matches) {
    _obMatches.set(String(m.SourceMatchID), { ...m, provider: 'OB', savedAt: now })
  }
  _sb(async () => {
    const rows = matches.map((m) => ({
      source_match_id: String(m.SourceMatchID),
      source_game_id:  String(m.SourceGameID || ''),
      home: String(m.Home || ''), home_id: String(m.HomeID || ''),
      away: String(m.Away || ''), away_id: String(m.AwayID || ''),
      bo: Number(m.BO) || 0, start_time: Number(m.StartTime) || 0,
      is_live: true, saved_at: now,
      raw: { ...m, provider: 'OB', savedAt: now },
    }))
    const { error } = await supabase.from('ob_matches')
      .upsert(rows, { onConflict: 'source_match_id' })
    if (error) throw error
  })
}

function getObMatchesForMerge() {
  const byId = {}
  for (const [id, row] of _obMatches) byId[id] = row
  return { OB: byId }
}

function pruneObMatches(activeIds) {
  if (!activeIds?.length) {
    _obMatches.clear()
    _sb(async () => { await supabase.from('ob_matches').delete().neq('source_match_id', '') })
    return
  }
  const active = new Set(activeIds.map(String))
  for (const id of _obMatches.keys()) {
    if (!active.has(id)) _obMatches.delete(id)
  }
  _sb(async () => {
    await supabase.from('ob_matches').delete()
      .not('source_match_id', 'in', `(${activeIds.map((id) => `"${id}"`).join(',')})`)
  })
}

// ─── client_matches（内存）───────────────────────────────────────────

const _clientMatches = new Map() // id → match object

function saveClientMatches(info) {
  if (!Array.isArray(info) || !info.length) return
  const now = Date.now()
  _clientMatches.clear()
  for (const m of info) _clientMatches.set(Number(m.ID), { ...m, built_at: now })
  _sb(async () => {
    const rows = info.map((m) => ({
      id: Number(m.ID), title: String(m.Title || ''), game: String(m.Game || ''),
      game_id: String(m.GameID || ''), start_time: Number(m.StartTime) || 0,
      bo: Number(m.BO) || 0, round: Number(m.Round) || 0,
      matchs: m.Matchs || {}, bets: m.Bets || [], built_at: now,
    }))
    const { error } = await supabase.from('client_matches')
      .upsert(rows, { onConflict: 'id' })
    if (error) throw error
  })
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

module.exports = {
  getProfileById, getProfileByName, upsertProfile, listProfiles, updateProfileSetting,
  loadProfileById, pullFromSupabase,
  listAccountsForUser, countAccounts, replaceAccountsForUser,
  updateAccountForUser, removeAccountForUser,
  setUserSetting, getUserSetting, countUserSettings,
  saveObMatches, getObMatchesForMerge, pruneObMatches,
  saveClientMatches, pruneClientMatches, getClientMatches,
}
