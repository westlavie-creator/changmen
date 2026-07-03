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
  const id = Number(playerId);
  const label = String(platformName || "").trim();
  const uid = ownerUserId != null ? String(ownerUserId).trim() : "";
  if (!Number.isFinite(id) || id <= 0 || !label)
    return false;
  const pool = getPgPool();
  if (!pool)
    return false;
  const now = Date.now();
  try {
    const params = uid ? [id, label, now, uid] : [id, label, now];
    const ownerClause = uid ? " AND owner_user_id = $4::uuid" : "";
    const { rowCount } = await pool.query(
      `UPDATE players SET platform_name = $2, updated_at = $3
       WHERE id = $1 AND deleted_at IS NULL${ownerClause}`,
      params,
    );
    return rowCount > 0;
  }
  catch (err) {
    console.warn("[rds] updatePlayerDisplayName:", err.message);
    return false;
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
  if (!uid || !Array.isArray(records))
    return;
  const pool = getPgPool();
  if (!pool)
    return;
  Promise.resolve()
    .then(async () => {
      for (const row of records) {
        await savePlayerAccountRecord(uid, row);
      }
    })
    .catch(err => console.warn("[rds] saveAccountRecordsForOwner:", err.message));
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
