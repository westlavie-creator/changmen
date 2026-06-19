/**
 * profiles 表读写及 users 用户名/管理员/metadata 更新。
 */

import { getPgPool, _jsonb } from "./common.js";

const PROFILE_WITH_ADMIN_FROM = `
  FROM profiles p
  JOIN users u ON u.id = p.id`;

/** 拉取所有 profiles 到内存（启动时调用） */
export async function fetchProfiles() {
  const pool = getPgPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query(`SELECT p.*, u.is_admin ${PROFILE_WITH_ADMIN_FROM}`);
    return rows || [];
  } catch (err) {
    console.error("[rds] fetchProfiles 失败:", err.message);
    return [];
  }
}

/** 按 uid 读单个 profile */
export async function fetchProfileById(uid) {
  const pool = getPgPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.is_admin ${PROFILE_WITH_ADMIN_FROM} WHERE p.id = $1`,
      [String(uid)],
    );
    return rows[0] || null;
  } catch (err) {
    console.warn("[rds] fetchProfileById:", err.message);
    return null;
  }
}

/** fire-and-forget：更新 profile 字段 */
export function writeProfile(uid, patch) {
  const now = Date.now();
  const pool = getPgPool();
  if (!pool) return;
  const jsonbCols = new Set(["accounts", "betting_config", "collect_config", "preferences"]);
  const keys = Object.keys(patch).filter((k) => k !== "updated_at");
  if (!keys.length) return;
  const sets = [];
  const vals = [String(uid)];
  for (const k of keys) {
    vals.push(jsonbCols.has(k) ? _jsonb(patch[k], patch[k]) : patch[k]);
    sets.push(jsonbCols.has(k) ? `${k} = $${vals.length}::jsonb` : `${k} = $${vals.length}`);
  }
  vals.push(now);
  sets.push(`updated_at = $${vals.length}`);
  Promise.resolve()
    .then(() => pool.query(`UPDATE profiles SET ${sets.join(", ")} WHERE id = $1`, vals))
    .catch((err) => console.warn("[rds:profiles]", err.message));
}

/** 在 profiles 表中创建新用户行（首次登录触发器未执行时的兜底） */
export async function insertProfile(uid, data) {
  const pool = getPgPool();
  if (!pool) return false;
  const rdsArgs = [
    String(data.id || uid),
    String(data.user_name || ""),
    JSON.stringify(data.accounts ?? []),
    JSON.stringify(data.betting_config ?? {}),
    JSON.stringify(data.collect_config ?? {}),
    JSON.stringify(data.preferences ?? {}),
    Number(data.created_at) || Date.now(),
    Number(data.updated_at) || Date.now(),
  ];
  try {
    await pool.query(
      `INSERT INTO profiles (id, user_name, accounts, betting_config, collect_config, preferences, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      rdsArgs,
    );
    return true;
  } catch (err) {
    console.warn("[rds] insertProfile:", err.message);
    return false;
  }
}

/** fire-and-forget：替换用户账号列表 */
export function writeAccounts(uid, accounts) {
  writeProfile(uid, { accounts });
}

/** 管理端：全量 profiles 摘要 */
export async function fetchProfilesAdmin() {
  const pool = getPgPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.user_name, p.accounts, p.betting_config, p.collect_config, p.preferences,
              p.created_at, p.updated_at, u.is_admin
       ${PROFILE_WITH_ADMIN_FROM}
       ORDER BY p.user_name ASC`,
    );
    return rows || [];
  } catch (err) {
    console.warn("[rds] fetchProfilesAdmin:", err.message);
    return [];
  }
}

/** 写入 user metadata（fire-and-forget；单 session 请用 setActiveSessionId） */
export function writeUserMetadata(userId, metadata) {
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
}

/** 更新登录用户名（users + profiles 同步） */
export async function updateUserName(userId, userName) {
  const pool = getPgPool();
  if (!pool) return false;
  const id = String(userId);
  const name = String(userName);
  const now = Date.now();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = await client.query(
      "UPDATE users SET user_name = $2, updated_at = $3 WHERE id = $1",
      [id, name, now],
    );
    if (!u.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    const p = await client.query(
      "UPDATE profiles SET user_name = $2, updated_at = $3 WHERE id = $1",
      [id, name, now],
    );
    if (!p.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      const dup = new Error("用户名已存在");
      dup.code = "DUPLICATE_USER_NAME";
      throw dup;
    }
    console.warn("[rds] updateUserName:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

/** 更新用户管理员标志 */
export async function updateUserIsAdmin(userId, isAdmin) {
  const pool = getPgPool();
  if (!pool) return false;
  try {
    const { rowCount } = await pool.query(
      `UPDATE users SET is_admin = $2, updated_at = $3 WHERE id = $1`,
      [String(userId), Boolean(isAdmin), Date.now()],
    );
    return rowCount > 0;
  } catch (err) {
    console.warn("[rds] updateUserIsAdmin:", err.message);
    return false;
  }
}
