/**
 * tag_platforms、players、user_logs 表读写。
 * 投注账号唯一真相：players（含 account_data jsonb）。
 */

import {
  accountRecordToPlayerPatch,
  playerRowToAccountRecord,
} from "../player_account_record.js";
import { getPgPool, _jsonb } from "./common.js";

const PLAYER_SELECT
  = `id, owner_user_id, platform_id, platform_name, player_name, provider, credit, total_balance,
     account_data, created_at, updated_at, deleted_at, delete_description`;

function _mapPlayerRow(row) {
  if (!row)
    return null;
  let accountData = {};
  if (row.account_data != null) {
    if (typeof row.account_data === "object" && !Array.isArray(row.account_data))
      accountData = row.account_data;
    else {
      try {
        accountData = JSON.parse(String(row.account_data || "{}"));
      }
      catch {
        accountData = {};
      }
    }
  }
  return {
    id: Number(row.id),
    playerId: Number(row.id),
    ownerUserId: row.owner_user_id != null ? String(row.owner_user_id) : null,
    platformId: Number(row.platform_id),
    platformName: String(row.platform_name || ""),
    playerName: String(row.player_name || ""),
    provider: String(row.provider || ""),
    credit: Number(row.credit) || 0,
    totalBalance: Number(row.total_balance) || 0,
    accountData,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
    deletedAt: row.deleted_at != null ? Number(row.deleted_at) : null,
    deleteDescription: String(row.delete_description || ""),
  };
}

export async function fetchTagPlatforms() {
  const pool = getPgPool();
  if (!pool)
    return [];
  try {
    const { rows } = await pool.query("SELECT id, name FROM tag_platforms ORDER BY id ASC");
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchTagPlatforms:", err.message);
    return [];
  }
}

export async function upsertTagPlatformByName(name) {
  const label = String(name || "").trim();
  if (!label)
    return null;
  const pool = getPgPool();
  if (!pool)
    return null;
  const now = Date.now();
  try {
    const { rows } = await pool.query(
      `INSERT INTO tag_platforms (name, created_at, updated_at)
       VALUES ($1, $2, $2)
       ON CONFLICT (name) DO UPDATE SET updated_at = EXCLUDED.updated_at
       RETURNING id, name`,
      [label, now],
    );
    return rows?.[0] ?? null;
  }
  catch (err) {
    console.warn("[rds] upsertTagPlatformByName:", err.message);
    return null;
  }
}

export async function insertPlayerRow({ platformId, platformName, playerName, ownerUserId }) {
  const pool = getPgPool();
  if (!pool)
    return null;
  const now = Date.now();
  const pid = Number(platformId);
  const uid = String(ownerUserId || "").trim();
  if (!Number.isFinite(pid) || pid <= 0 || !uid)
    return null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO players (
         owner_user_id, platform_id, platform_name, player_name, provider,
         credit, total_balance, account_data, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, '', 0, 0, '{}'::jsonb, $5, $5)
       RETURNING ${PLAYER_SELECT}`,
      [uid, pid, String(platformName || ""), String(playerName || ""), now],
    );
    return _mapPlayerRow(rows?.[0]);
  }
  catch (err) {
    console.warn("[rds] insertPlayerRow:", err.message);
    return null;
  }
}

export async function fetchPlayerByPlatformAndName(platformId, playerName, ownerUserId) {
  const pid = Number(platformId);
  const name = String(playerName || "").trim();
  const uid = String(ownerUserId || "").trim();
  if (!Number.isFinite(pid) || pid <= 0 || !name || !uid)
    return null;
  const pool = getPgPool();
  if (!pool)
    return null;
  try {
    const { rows } = await pool.query(
      `SELECT ${PLAYER_SELECT}
       FROM players
       WHERE platform_id = $1 AND player_name = $2 AND owner_user_id = $3::uuid AND deleted_at IS NULL
       ORDER BY id ASC
       LIMIT 1`,
      [pid, name, uid],
    );
    return _mapPlayerRow(rows?.[0]);
  }
  catch (err) {
    console.warn("[rds] fetchPlayerByPlatformAndName:", err.message);
    return null;
  }
}

export async function fetchPlayerById(playerId) {
  const id = Number(playerId);
  if (!Number.isFinite(id) || id <= 0)
    return null;
  const pool = getPgPool();
  if (!pool)
    return null;
  try {
    const { rows } = await pool.query(
      `SELECT ${PLAYER_SELECT}
       FROM players WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return _mapPlayerRow(rows?.[0]);
  }
  catch (err) {
    console.warn("[rds] fetchPlayerById:", err.message);
    return null;
  }
}

/** 批量读 players（归属校验、SaveData ACCOUNT） */
export async function fetchPlayersByIds(playerIds) {
  const ids = [...new Set((playerIds || []).map(id => Number(id)).filter(id => id > 0))];
  if (!ids.length)
    return [];
  const pool = getPgPool();
  if (!pool)
    return [];
  try {
    const { rows } = await pool.query(
      `SELECT ${PLAYER_SELECT}
       FROM players WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL`,
      [ids],
    );
    return (rows || []).map(r => _mapPlayerRow(r)).filter(Boolean);
  }
  catch (err) {
    console.warn("[rds] fetchPlayersByIds:", err.message);
    return [];
  }
}

export async function insertUserLogRow(userId, title, data) {
  const uid = String(userId || "").trim();
  if (!uid)
    return false;
  const pool = getPgPool();
  if (!pool)
    return false;
  const now = Date.now();
  try {
    await pool.query(
      `INSERT INTO user_logs (user_id, title, data, create_at)
       VALUES ($1, $2, $3, $4)`,
      [uid, String(title || ""), String(data ?? ""), now],
    );
    return true;
  }
  catch (err) {
    console.warn("[rds] insertUserLogRow:", err.message);
    return false;
  }
}

/** 运维：按用户 + 时间窗读取 Client_SaveUserLog 诊断日志 */
export async function fetchUserLogsInRange(userId, fromMs, toMs, limit = 200) {
  const uid = String(userId || "").trim();
  if (!uid)
    return [];
  const pool = getPgPool();
  if (!pool)
    return [];
  const from = Number(fromMs) || 0;
  const to = Number(toMs) || Date.now();
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 500);
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, title, data, create_at
       FROM user_logs
       WHERE user_id = $1 AND create_at >= $2 AND create_at <= $3
       ORDER BY create_at ASC
       LIMIT $4`,
      [uid, from, to, cap],
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchUserLogsInRange:", err.message);
    return [];
  }
}

/** 仅更新 players.platform_name（账号显示名；不改 platform_id） */
export async function updatePlayerDisplayName(playerId, platformName, ownerUserId) {
  const count = await batchUpdatePlayerDisplayNames(ownerUserId, [{ playerId, platformName }]);
  return count > 0;
}

/** SaveData ACCOUNT：批量更新 platform_name（跳过未变化项由调用方负责） */
export async function batchUpdatePlayerDisplayNames(ownerUserId, updates) {
  const uid = String(ownerUserId || "").trim();
  const rows = (updates || [])
    .map(u => ({
      playerId: Number(u?.playerId),
      platformName: String(u?.platformName || "").trim(),
    }))
    .filter(u => Number.isFinite(u.playerId) && u.playerId > 0 && u.platformName);
  if (!uid || !rows.length)
    return 0;
  const pool = getPgPool();
  if (!pool)
    return 0;
  const now = Date.now();
  try {
    const { rowCount } = await pool.query(
      `UPDATE players AS p SET
         platform_name = v.label,
         updated_at = $3
       FROM unnest($1::bigint[], $2::text[]) AS v(id, label)
       WHERE p.id = v.id
         AND p.owner_user_id = $4::uuid
         AND p.deleted_at IS NULL`,
      [rows.map(r => r.playerId), rows.map(r => r.platformName), now, uid],
    );
    return rowCount ?? 0;
  }
  catch (err) {
    console.warn("[rds] batchUpdatePlayerDisplayNames:", err.message);
    return 0;
  }
}

export async function updatePlayerBalanceRow(playerId, balance, ownerUserId) {
  const id = Number(playerId);
  if (!Number.isFinite(id) || id <= 0)
    return null;
  const pool = getPgPool();
  if (!pool)
    return null;
  const now = Date.now();
  const total = Number(balance) || 0;
  const uid = ownerUserId != null ? String(ownerUserId).trim() : "";
  try {
    const params = uid ? [id, total, now, uid] : [id, total, now];
    const ownerClause = uid ? " AND owner_user_id = $4::uuid" : "";
    const { rows } = await pool.query(
      `UPDATE players SET total_balance = $2, updated_at = $3
       WHERE id = $1 AND deleted_at IS NULL${ownerClause}
       RETURNING ${PLAYER_SELECT}`,
      params,
    );
    const row = _mapPlayerRow(rows?.[0]);
    if (!row)
      return null;
    return {
      total: row.totalBalance,
      platformId: row.platformId,
      platformName: row.platformName,
    };
  }
  catch (err) {
    console.warn("[rds] updatePlayerBalanceRow:", err.message);
    return null;
  }
}

export async function softDeletePlayerRow(playerId, description, ownerUserId) {
  const id = Number(playerId);
  if (!Number.isFinite(id) || id <= 0)
    return false;
  const pool = getPgPool();
  if (!pool)
    return false;
  const now = Date.now();
  const uid = ownerUserId != null ? String(ownerUserId).trim() : "";
  try {
    const params = uid ? [id, now, String(description || ""), uid] : [id, now, String(description || "")];
    const ownerClause = uid ? " AND owner_user_id = $4::uuid" : "";
    const res = await pool.query(
      `UPDATE players
       SET deleted_at = $2, delete_description = $3, updated_at = $2
       WHERE id = $1 AND deleted_at IS NULL${ownerClause}`,
      params,
    );
    return (res.rowCount ?? 0) > 0;
  }
  catch (err) {
    console.warn("[rds] softDeletePlayerRow:", err.message);
    return false;
  }
}

export async function softDeletePlayersNotInList(ownerUserId, keepPlayerIds, description = "pruned: not in ACCOUNT list") {
  const uid = String(ownerUserId || "").trim();
  const keep = [...new Set((keepPlayerIds || []).map(id => Number(id)).filter(id => id > 0))];
  if (!uid || !keep.length)
    return 0;
  const pool = getPgPool();
  if (!pool)
    return 0;
  const now = Date.now();
  try {
    const { rowCount } = await pool.query(
      `UPDATE players
       SET deleted_at = $1, delete_description = $2, updated_at = $1
       WHERE owner_user_id = $3::uuid
         AND deleted_at IS NULL
         AND NOT (id = ANY($4::bigint[]))`,
      [now, String(description || ""), uid, keep],
    );
    return rowCount ?? 0;
  }
  catch (err) {
    console.warn("[rds] softDeletePlayersNotInList:", err.message);
    return 0;
  }
}

/** 用户全部活跃账号 → A8 AccountRecord[] */
export async function fetchAccountRecordsByOwner(ownerUserId) {
  const uid = String(ownerUserId || "").trim();
  if (!uid)
    return [];
  const pool = getPgPool();
  if (!pool)
    return [];
  try {
    const { rows } = await pool.query(
      `SELECT ${PLAYER_SELECT}
       FROM players
       WHERE owner_user_id = $1::uuid AND deleted_at IS NULL
       ORDER BY id ASC`,
      [uid],
    );
    return (rows || []).map(r => playerRowToAccountRecord(_mapPlayerRow(r))).filter(Boolean);
  }
  catch (err) {
    console.warn("[rds] fetchAccountRecordsByOwner:", err.message);
    return [];
  }
}

export async function countActivePlayersByOwner(ownerUserId) {
  const uid = String(ownerUserId || "").trim();
  if (!uid)
    return 0;
  const pool = getPgPool();
  if (!pool)
    return 0;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM players
       WHERE owner_user_id = $1::uuid AND deleted_at IS NULL`,
      [uid],
    );
    return Number(rows?.[0]?.c) || 0;
  }
  catch (err) {
    console.warn("[rds] countActivePlayersByOwner:", err.message);
    return 0;
  }
}

/** 单条账号 upsert 到 players（SaveData ACCOUNT / 余额刷新） */
export async function savePlayerAccountRecord(ownerUserId, record) {
  const uid = String(ownerUserId || "").trim();
  const patch = accountRecordToPlayerPatch(record);
  const id = Number(patch.playerId);
  if (!uid || !Number.isFinite(id) || id <= 0)
    return false;
  const pool = getPgPool();
  if (!pool)
    return false;
  const now = Number(patch.updatedAt) || Date.now();
  const platformId = patch.platformId;
  try {
    const params = [
      id,
      uid,
      patch.platformName,
      patch.playerName,
      patch.provider,
      patch.credit,
      patch.totalBalance,
      _jsonb(patch.accountData, {}),
      now,
    ];
    let platformClause = "";
    if (platformId != null && Number.isFinite(platformId) && platformId > 0) {
      params.push(platformId);
      platformClause = `, platform_id = $${params.length}`;
    }
    const { rowCount } = await pool.query(
      `UPDATE players SET
         platform_name = $3,
         player_name = $4,
         provider = $5,
         credit = $6,
         total_balance = $7,
         account_data = $8::jsonb,
         updated_at = $9${platformClause}
       WHERE id = $1 AND owner_user_id = $2::uuid AND deleted_at IS NULL`,
      params,
    );
    return (rowCount ?? 0) > 0;
  }
  catch (err) {
    console.warn("[rds] savePlayerAccountRecord:", err.message);
    return false;
  }
}

/** fire-and-forget：整包 SaveData ACCOUNT */
export function saveAccountRecordsForOwner(ownerUserId, records) {
  const uid = String(ownerUserId || "").trim();
  if (!uid || !Array.isArray(records) || !records.length)
    return;
  const pool = getPgPool();
  if (!pool)
    return;
  Promise.resolve()
    .then(() => batchSavePlayerAccountRecords(uid, records))
    .catch(err => console.warn("[rds] saveAccountRecordsForOwner:", err.message));
}

/** 批量 UPDATE players（SaveData ACCOUNT 落库） */
export async function batchSavePlayerAccountRecords(ownerUserId, records) {
  const uid = String(ownerUserId || "").trim();
  if (!uid || !Array.isArray(records) || !records.length)
    return 0;
  const patches = records
    .map(r => accountRecordToPlayerPatch(r))
    .filter(p => Number.isFinite(p.playerId) && p.playerId > 0);
  if (!patches.length)
    return 0;
  const pool = getPgPool();
  if (!pool)
    return 0;
  const now = Date.now();
  const ids = [];
  const platformNames = [];
  const playerNames = [];
  const providers = [];
  const credits = [];
  const totalBalances = [];
  const accountDatas = [];
  const updatedAts = [];
  const platformIds = [];
  for (const patch of patches) {
    ids.push(Number(patch.playerId));
    platformNames.push(String(patch.platformName || ""));
    playerNames.push(String(patch.playerName || ""));
    providers.push(String(patch.provider || ""));
    credits.push(Number(patch.credit) || 0);
    totalBalances.push(Number(patch.totalBalance) || 0);
    accountDatas.push(JSON.parse(_jsonb(patch.accountData, {})));
    updatedAts.push(Number(patch.updatedAt) || now);
    platformIds.push(
      patch.platformId != null && Number.isFinite(Number(patch.platformId)) && Number(patch.platformId) > 0
        ? Number(patch.platformId)
        : null,
    );
  }
  try {
    const { rowCount } = await pool.query(
      `UPDATE players AS p SET
         platform_name = u.platform_name,
         player_name = u.player_name,
         provider = u.provider,
         credit = u.credit,
         total_balance = u.total_balance,
         account_data = u.account_data,
         updated_at = u.updated_at,
         platform_id = COALESCE(u.platform_id, p.platform_id)
       FROM unnest(
         $1::bigint[],
         $2::text[],
         $3::text[],
         $4::text[],
         $5::float8[],
         $6::float8[],
         $7::jsonb[],
         $8::bigint[],
         $9::bigint[]
       ) AS u(
         id, platform_name, player_name, provider, credit, total_balance,
         account_data, updated_at, platform_id
       )
       WHERE p.id = u.id
         AND p.owner_user_id = $10::uuid
         AND p.deleted_at IS NULL`,
      [
        ids,
        platformNames,
        playerNames,
        providers,
        credits,
        totalBalances,
        accountDatas,
        updatedAts,
        platformIds,
        uid,
      ],
    );
    return rowCount ?? 0;
  }
  catch (err) {
    console.warn("[rds] batchSavePlayerAccountRecords:", err.message);
    return 0;
  }
}

/** 部分字段更新（余额刷新 syncAccountRowInKv） */
export async function patchPlayerAccountRecord(ownerUserId, playerId, updates) {
  const uid = String(ownerUserId || "").trim();
  const id = Number(playerId);
  if (!uid || !Number.isFinite(id) || id <= 0)
    return null;
  const existing = await fetchPlayerById(id);
  if (!existing || String(existing.ownerUserId) !== uid)
    return null;
  const merged = playerRowToAccountRecord(existing);
  Object.assign(merged, updates, { accountId: id, updateTime: Date.now() });
  const ok = await savePlayerAccountRecord(uid, merged);
  if (!ok)
    return null;
  const refreshed = await fetchPlayerById(id);
  return playerRowToAccountRecord(refreshed);
}
