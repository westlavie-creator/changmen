/**
 * tag_platforms、players、user_logs 表读写。
 */

import { getPgPool } from "./common.js";

function _mapPlayerRow(row) {
  if (!row)
    return null;
  return {
    id: Number(row.id),
    playerId: Number(row.id),
    ownerUserId: row.owner_user_id != null ? String(row.owner_user_id) : null,
    platformId: Number(row.platform_id),
    platformName: String(row.platform_name || ""),
    playerName: String(row.player_name || ""),
    credit: Number(row.credit) || 0,
    totalBalance: Number(row.total_balance) || 0,
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
         owner_user_id, platform_id, platform_name, player_name,
         credit, total_balance, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 0, 0, $5, $5)
       RETURNING id, owner_user_id, platform_id, platform_name, player_name, credit, total_balance,
                 created_at, updated_at, deleted_at, delete_description`,
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
      `SELECT id, owner_user_id, platform_id, platform_name, player_name, credit, total_balance,
              created_at, updated_at, deleted_at, delete_description
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
      `SELECT id, owner_user_id, platform_id, platform_name, player_name, credit, total_balance,
              created_at, updated_at, deleted_at, delete_description
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
       RETURNING id, owner_user_id, platform_id, platform_name, player_name, credit, total_balance,
                 created_at, updated_at, deleted_at, delete_description`,
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
