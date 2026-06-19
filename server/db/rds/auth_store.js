/**
 * JWT 鉴权 + users 表 session 管理。
 */

import crypto from "node:crypto";
import { hasDatabaseUrlConfig } from "../resolve_database_url.js";
import { getPgPool } from "./common.js";
import {
  JWT_SECRET,
  JWT_ACCESS_TTL_SEC,
  JWT_REFRESH_TTL_SEC,
  signJwt,
  verifyJwt,
} from "./jwt.js";

/** 密码登录；返回 { accessToken, refreshToken, userId, email } 或 null */
export async function authSignIn(userName, password) {
  const name = String(userName || "").trim();
  const pwd = String(password || "");
  if (!name || !pwd) return null;

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
    const refreshToken = signJwt(
      { sub: userId, typ: "refresh", session_id: sessionId },
      JWT_SECRET,
      JWT_REFRESH_TTL_SEC,
    );
    if (!(await setActiveSessionId(userId, sessionId))) return null;
    return {
      accessToken,
      refreshToken,
      userId,
      email: `${row.user_name}@gamebet.local`,
    };
  } catch (err) {
    console.warn("[rds] authSignIn:", err.message);
    return { error: "db", message: err.message };
  }
}

/** 登出（JWT 无服务端 session，no-op） */
export async function authSignOut(_token) {}

async function fetchUserActiveSessionId(userId) {
  const pool = getPgPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `SELECT metadata->>'active_session_id' AS sid FROM users WHERE id = $1`,
      [String(userId)],
    );
    const sid = rows[0]?.sid;
    return sid ? String(sid) : "";
  } catch (err) {
    console.warn("[rds] fetchUserActiveSessionId:", err.message);
    return null;
  }
}

/** 无 active_session_id 时放行（旧会话）；有则必须与 token 内 session_id 一致 */
async function isSessionActive(userId, sessionId) {
  if (!sessionId) return false;
  const active = await fetchUserActiveSessionId(userId);
  if (active === null) return false;
  if (!active) return true;
  return active === String(sessionId);
}

async function setActiveSessionId(userId, sessionId) {
  const pool = getPgPool();
  if (!pool || !userId || !sessionId) return false;
  try {
    const { rowCount } = await pool.query(
      `UPDATE users SET metadata = metadata || $2::jsonb, updated_at = $3 WHERE id = $1`,
      [String(userId), JSON.stringify({ active_session_id: String(sessionId) }), Date.now()],
    );
    return rowCount > 0;
  } catch (err) {
    console.warn("[rds] setActiveSessionId:", err.message);
    return false;
  }
}

/** 校验 token；返回 { userId, metadata } 或 null */
export async function authGetUser(token) {
  if (!token || !JWT_SECRET) return null;
  const payload = verifyJwt(token, JWT_SECRET);
  if (!payload?.sub || payload.typ !== "access") return null;
  const sessionId = payload.session_id ? String(payload.session_id) : "";
  if (!(await isSessionActive(payload.sub, sessionId))) return null;
  return { userId: String(payload.sub), metadata: {} };
}

/** 用 refresh token 换取新的 access/refresh token；{ revoked: true } 表示已在别处登录 */
export async function authRefreshToken(refreshToken) {
  if (!JWT_SECRET) return null;
  const payload = verifyJwt(refreshToken, JWT_SECRET);
  if (!payload?.sub || payload.typ !== "refresh") return null;
  const userId = String(payload.sub);
  const sessionId = payload.session_id ? String(payload.session_id) : "";
  if (!sessionId) return { revoked: true };
  const active = await fetchUserActiveSessionId(userId);
  if (active === null) return null;
  if (active && active !== sessionId) return { revoked: true };
  const pool = getPgPool();
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      "SELECT user_name FROM users WHERE id = $1",
      [userId],
    );
    const row = rows[0];
    if (!row) return null;
    const accessToken = signJwt(
      { sub: userId, typ: "access", session_id: sessionId },
      JWT_SECRET,
      JWT_ACCESS_TTL_SEC,
    );
    const newRefresh = signJwt(
      { sub: userId, typ: "refresh", session_id: sessionId },
      JWT_SECRET,
      JWT_REFRESH_TTL_SEC,
    );
    return {
      accessToken,
      refreshToken: newRefresh,
      userId,
      email: `${row.user_name}@gamebet.local`,
    };
  } catch (err) {
    console.warn("[rds] authRefreshToken:", err.message);
    return null;
  }
}

export function hasAdminAccess() {
  return !!getPgPool();
}

export function isAuthConfigured() {
  return !!(hasDatabaseUrlConfig() && JWT_SECRET.length >= 16);
}
